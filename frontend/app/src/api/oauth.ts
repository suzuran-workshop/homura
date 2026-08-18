// frontend/app/src/api/oauth.ts
// OAuth IdP API client — WebAuthn (Passkey) + DingTalk OAuth + OAuth2 token.
import apiClient from './client'

// ---- WebAuthn login ----

export interface BeginLoginResponse {
  sessionId: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  options: any
}

export interface OrgChoice {
  orgId: number
  orgName: string
  isAdmin: boolean
}

export interface LoginResult {
  sessionId: string
  userId: number
  availableOrgs: OrgChoice[]
}

// ---- Password login ----

export interface PasswordLoginRequest {
  username: string
  password: string
}

export async function loginWithPassword(data: PasswordLoginRequest) {
  return apiClient.post<LoginResult>('/oauth/password/login', data)
}

// ---- WebAuthn login ----

export async function beginLogin() {
  return apiClient.post<BeginLoginResponse>('/oauth/webauthn/login/begin', {})
}

export async function finishLogin(sessionId: string, response: unknown) {
  return apiClient.post<LoginResult>('/oauth/webauthn/login/finish', { sessionId, response })
}

// ---- Session token exchange ----

export interface SessionTokenResponse {
  access_token: string
  token_type: string
  expires_in: number
  refresh_token: string
  scope?: string
}

export async function exchangeLoginSession(sessionId: string, orgId: number) {
  return apiClient.post<SessionTokenResponse>('/oauth/session/token', {
    sessionId,
    orgId,
  })
}

// ---- DingTalk OAuth ----

export async function getDingTalkAuthorizeURL(redirectURI: string) {
  return apiClient.get<{ authorizeUrl: string }>('/oauth/dingtalk/authorize', {
    params: { redirect_uri: redirectURI },
  })
}

// ---- OAuth2 token endpoint ----

export interface TokenResponse {
  access_token: string
  token_type: string
  expires_in: number
  refresh_token: string
  scope?: string
}

export async function exchangeAuthorizationCode(
  code: string,
  clientId: string,
  redirectURI: string,
  codeVerifier: string,
) {
  // Use form-urlencoded as per OAuth2 spec.
  const params = new URLSearchParams()
  params.set('grant_type', 'authorization_code')
  params.set('code', code)
  params.set('client_id', clientId)
  params.set('redirect_uri', redirectURI)
  params.set('code_verifier', codeVerifier)
  return apiClient.post<TokenResponse>('/oauth/token', params, {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  })
}

export async function refreshAccessToken(refreshToken: string, clientId: string) {
  const params = new URLSearchParams()
  params.set('grant_type', 'refresh_token')
  params.set('refresh_token', refreshToken)
  params.set('client_id', clientId)
  return apiClient.post<TokenResponse>('/oauth/token', params, {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  })
}

export async function revokeToken(token: string) {
  return apiClient.post('/oauth/revoke', { token })
}

// ---- Server public key (for verifying tokens client-side, optional) ----

export interface MetadataResponse {
  issuer: string
  authorization_endpoint: string
  token_endpoint: string
  revocation_endpoint: string
  response_types_supported: string[]
  grant_types_supported: string[]
  code_challenge_methods_supported: string[]
  scopes_supported: string[]
}

export async function getMetadata() {
  return apiClient.get<MetadataResponse>('/.well-known/openid-configuration')
}
