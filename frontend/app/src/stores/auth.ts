// frontend/app/src/stores/auth.ts
// Auth store — Multi-method auth: password (primary), WebAuthn, DingTalk.
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import {
  beginLogin,
  finishLogin,
  getDingTalkAuthorizeURL,
  exchangeLoginSession,
  refreshAccessToken,
  loginWithPassword,
  type OrgChoice,
  type LoginResult,
} from '../api/oauth'

interface User {
  id: number
  name?: string
  email?: string
  role?: 'provider' | 'tenant_admin' | 'user'
  orgId?: number
}

// The OAuth client_id for the platform's own frontend (this SPA).
const PLATFORM_CLIENT_ID = 'suzuran-spa'

export const useAuthStore = defineStore('auth', () => {
  const user = ref<User | null>(null)
  const token = ref<string>('')
  const refreshToken = ref<string>('')
  const availableOrgs = ref<OrgChoice[]>([])
  // loginSessionId is set after WebAuthn/DingTalk login and consumed by completeLoginWithToken.
  const loginSessionId = ref<string>('')

  const isAuthenticated = computed(() => !!token.value)
  const userRole = computed(() => user.value?.role || '')

  // ---- Password login (primary method) ----

  async function loginWithUsernamePassword(username: string, password: string): Promise<LoginResult> {
    const resp = await loginWithPassword({ username, password })
    const data = resp.data
    availableOrgs.value = data.availableOrgs
    loginSessionId.value = data.sessionId
    return data
  }

  // ---- WebAuthn login ----

  async function loginWithPasskey(): Promise<LoginResult> {
    const begin = await beginLogin()
    const rawOptions = begin.data.options.publicKey || begin.data.options
    const options = decodePublicKeyRequestOptions(rawOptions)
    const assertion = await navigator.credentials.get({
      publicKey: options,
    })
    if (!assertion) throw new Error('Passkey authentication cancelled')
    const serialized = serializeAssertionCredential(assertion as PublicKeyCredential)
    const result = await finishLogin(begin.data.sessionId, serialized)
    const data = result.data
    availableOrgs.value = data.availableOrgs
    // Stash the login sessionId so completeLoginWithToken can use it.
    loginSessionId.value = data.sessionId
    return data
  }

  // ---- Complete login: exchange session + org for tokens ----

  async function completeLoginWithToken(sessionId: string, orgId: number) {
    const resp = await exchangeLoginSession(sessionId, orgId)
    setTokens(resp.data.access_token, resp.data.refresh_token, resp.data.scope)
    const u: User = {
      id: 0,
      orgId: orgId,
      role: determineRole(orgId),
    }
    setUser(u)
    loginSessionId.value = ''
    return resp.data
  }

  // Determine role based on the selected org from availableOrgs.
  function determineRole(orgId: number): 'provider' | 'tenant_admin' | 'user' {
    const match = availableOrgs.value.find(o => o.orgId === orgId)
    if (!match) return 'user'
    if (orgId === 1 && match.isAdmin) return 'provider'
    if (match.isAdmin) return 'tenant_admin'
    return 'user'
  }

  // ---- DingTalk OAuth ----

  async function redirectToDingTalk(redirectURI: string) {
    const resp = await getDingTalkAuthorizeURL(redirectURI)
    window.location.href = resp.data.authorizeUrl
  }

  // ---- Token management ----

  function setTokens(accessToken: string, refresh: string, scope?: string) {
    token.value = accessToken
    refreshToken.value = refresh
    localStorage.setItem('token', accessToken)
    localStorage.setItem('refresh_token', refresh)
    if (scope) localStorage.setItem('scope', scope)
  }

  function setUser(u: User) {
    user.value = u
    localStorage.setItem('user', JSON.stringify(u))
  }

  // Keep for backward compatibility (used by Login.vue old path).
  function selectOrgAndMintToken(orgId: number, role: 'provider' | 'tenant_admin' | 'user') {
    const u = user.value || { id: 0 }
    u.orgId = orgId
    u.role = role
    setUser(u as User)
  }

  // Refresh the access token using the stored refresh token.
  async function refresh() {
    if (!refreshToken.value) {
      logout()
      return
    }
    try {
      const resp = await refreshAccessToken(refreshToken.value, PLATFORM_CLIENT_ID)
      setTokens(resp.data.access_token, resp.data.refresh_token, resp.data.scope)
    } catch {
      logout()
    }
  }

  function logout() {
    user.value = null
    token.value = ''
    refreshToken.value = ''
    availableOrgs.value = []
    loginSessionId.value = ''
    localStorage.removeItem('token')
    localStorage.removeItem('refresh_token')
    localStorage.removeItem('user')
    localStorage.removeItem('scope')
  }

  // Initialize from localStorage (called on app start).
  function initFromStorage() {
    const storedToken = localStorage.getItem('token')
    const storedRefresh = localStorage.getItem('refresh_token')
    const storedUser = localStorage.getItem('user')
    if (storedToken && storedUser) {
      token.value = storedToken
      refreshToken.value = storedRefresh || ''
      user.value = JSON.parse(storedUser)
    }
  }

  return {
    user,
    token,
    refreshToken,
    availableOrgs,
    loginSessionId,
    isAuthenticated,
    userRole,
    loginWithUsernamePassword,
    loginWithPasskey,
    completeLoginWithToken,
    redirectToDingTalk,
    selectOrgAndMintToken,
    refresh,
    logout,
    initFromStorage,
    setTokens,
    setUser,
  }
})

// ---- WebAuthn credential serialization helpers ----

function serializeAssertionCredential(cred: PublicKeyCredential): unknown {
  const response = cred.response as AuthenticatorAssertionResponse
  return {
    id: cred.id,
    rawId: arrayBufferToBase64Url(cred.rawId),
    type: cred.type,
    response: {
      authenticatorData: arrayBufferToBase64Url(response.authenticatorData),
      clientDataJSON: arrayBufferToBase64Url(response.clientDataJSON),
      signature: arrayBufferToBase64Url(response.signature),
      userHandle: response.userHandle ? arrayBufferToBase64Url(response.userHandle) : null,
    },
    clientExtensionResults: {},
  }
}

function arrayBufferToBase64Url(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf)
  let bin = ''
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
  const base64 = btoa(bin)
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

// ---- WebAuthn options decoding (base64url → ArrayBuffer) ----

function base64UrlToBuffer(base64url: string): Uint8Array {
  const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/')
  const pad = base64.length % 4
  const padded = pad ? base64 + '='.repeat(4 - pad) : base64
  const binary = atob(padded)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

function decodePublicKeyRequestOptions(raw: any): PublicKeyCredentialRequestOptions {
  return {
    challenge: base64UrlToBuffer(raw.challenge) as BufferSource,
    timeout: raw.timeout,
    rpId: raw.rpId,
    allowCredentials: raw.allowCredentials?.map((c: any) => ({
      ...c,
      id: base64UrlToBuffer(c.id) as BufferSource,
    })),
    userVerification: raw.userVerification,
    extensions: raw.extensions,
  }
}
