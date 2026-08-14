import type { Page } from '@playwright/test'

/**
 * WebAuthn test helpers.
 *
 * The platform is OAuth-only — every E2E flow that touches a protected page
 * must complete a real WebAuthn ceremony. Playwright drives this via the
 * Chrome DevTools Protocol (CDP) WebAuthn domain: we add a *virtual
 * authenticator* that automatically approves navigator.credentials.create()
 * and navigator.credentials.get() without interactive prompts.
 *
 * Usage in a test:
 *
 *   const auth = await enableVirtualAuthenticator(page)
 *   // ... register a passkey, log in, assert protected page ...
 *
 * The virtual authenticator lives on the page's browser context. Each test
 * gets its own context (Playwright default), so credentials don't leak across
 * tests. To isolate further, tests can call setAutomaticPresence.
 */

interface VirtualAuthenticatorOptions {
  protocol?: 'ctap2' | 'u2f'
  transport?: 'usb' | 'nfc' | 'ble' | 'internal'
  hasResidentKey?: boolean
  hasUserVerification?: boolean
  isUserVerified?: boolean
  automaticPresenceSimulation?: boolean
}

const DEFAULTS: Required<VirtualAuthenticatorOptions> = {
  protocol: 'ctap2',
  transport: 'internal',
  hasResidentKey: true,
  hasUserVerification: true,
  isUserVerified: true,
  automaticPresenceSimulation: true,
}

export interface VirtualAuthenticator {
  authenticatorId: string
  cdpage: import('playwright').CDPSession
  remove: () => Promise<void>
}

/**
 * Enable the WebAuthn domain and add a virtual authenticator to the page's
 * browser context. The authenticator auto-approves ceremonies.
 */
export async function enableVirtualAuthenticator(
  page: Page,
  opts: VirtualAuthenticatorOptions = {},
): Promise<VirtualAuthenticator> {
  const o = { ...DEFAULTS, ...opts }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cdpage = await (page.context() as any).newCDPSession(page) as import('playwright').CDPSession

  // enableUI=false: suppress Chrome's interactive WebAuthn UI so ceremonies
  // resolve non-interactively under the virtual authenticator.
  await (cdpage.send as any)('WebAuthn.enable' as never, { enableUI: false })
  const { authenticatorId } = await (cdpage.send as any)('WebAuthn.addVirtualAuthenticator', {
    options: {
      protocol: o.protocol,
      ctap2Version: 'ctap2_1',
      transport: o.transport,
      hasResidentKey: o.hasResidentKey,
      hasUserVerification: o.hasUserVerification,
      isUserVerified: o.isUserVerified,
      automaticPresenceSimulation: o.automaticPresenceSimulation,
    },
  })

  return {
    authenticatorId,
    cdpage,
    async remove() {
      try {
        await (cdpage.send as any)('WebAuthn.removeVirtualAuthenticator', { authenticatorId })
        await (cdpage.send as any)('WebAuthn.disable' as never)
        await (cdpage as any).detach()
      } catch {
        // context teardown may race; ignore.
      }
    },
  }
}

/**
 * Convenience: wait for a navigator.credentials call to settle. Virtual
 * authenticator resolves synchronously, but the app's async post-processing
 * (API round-trips) needs a tick.
 */
export async function settleAuth() {
  await new Promise((r) => setTimeout(r, 100))
}

/**
 * Register a passkey via backend API directly (no UI — register page is removed).
 * The virtual authenticator must already be enabled on the page's context.
 *
 * When userId is 0, the backend creates a new user with the given name/email.
 * When userId > 0, the backend adds a credential to an existing user.
 *
 * Returns the user ID assigned by the backend.
 */
export async function registerPasskeyViaAPI(
  page: import('playwright').Page,
  name: string,
  email: string,
  userId = 0,
): Promise<number> {
  // Call register begin
  const beginResp = await page.evaluate(async (args) => {
    const res = await fetch('http://localhost:8888/oauth/webauthn/register/begin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: args.userId, name: args.name, email: args.email }),
    })
    return await res.json()
  }, { userId, name, email })

  // Decode the public key creation options from the response
  const rawOptions = beginResp.options.publicKey || beginResp.options
  const challengeBuffer = base64UrlToBuffer(rawOptions.challenge)
  const options: PublicKeyCredentialCreationOptions = {
    challenge: challengeBuffer,
    rp: rawOptions.rp,
    user: {
      ...rawOptions.user,
      id: base64UrlToBuffer(rawOptions.user.id),
    },
    pubKeyCredParams: rawOptions.pubKeyCredParams,
    timeout: rawOptions.timeout,
    attestation: rawOptions.attestation,
    authenticatorSelection: rawOptions.authenticatorSelection,
    excludeCredentials: rawOptions.excludeCredentials?.map((c: { id: string }) => ({
      ...c,
      id: base64UrlToBuffer(c.id),
    })),
    extensions: rawOptions.extensions,
  }

  // Create credential via virtual authenticator
  const credential = await page.evaluate(async (opts) => {
    return await navigator.credentials.create({ publicKey: opts }) as PublicKeyCredential
  }, options as unknown as PublicKeyCredentialCreationOptions)

  if (!credential) throw new Error('Passkey creation cancelled')

  // Serialize and send finish
  const response = credential.response as AuthenticatorAttestationResponse
  const serialized = {
    id: credential.id,
    rawId: arrayBufferToBase64Url(credential.rawId),
    type: credential.type,
    response: {
      attestationObject: arrayBufferToBase64Url(response.attestationObject),
      clientDataJSON: arrayBufferToBase64Url(response.clientDataJSON),
    },
    clientExtensionResults: {},
  }

  const finishResp = await page.evaluate(async (args) => {
    const res = await fetch('http://localhost:8888/oauth/webauthn/register/finish', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: args.sessionId, response: args.serialized }),
    })
    return await res.json()
  }, { sessionId: beginResp.sessionId, serialized })

  return finishResp.userId as number
}

/**
 * Log in via the Login page UI using a previously-registered passkey.
 * Completes the full WebAuthn ceremony and token exchange, leaving the
 * browser authenticated. The caller chooses which org to enter by index
 * (default: first available).
 */
export async function loginWithPasskeyViaUI(
  page: import('playwright').Page,
  identifier: string,
  orgIndex = 0,
) {
  await page.goto('/login')
  await page.waitForSelector('input[placeholder="输入注册时的邮箱或用户名"]', { timeout: 5000 })
  await page.getByPlaceholder('输入注册时的邮箱或用户名').fill(identifier)
  await page.getByRole('button', { name: /Passkey 登录/ }).click()
  // Login.vue auto-selects the first available org and exchanges for tokens,
  // then routes by role. Wait for navigation away from /login.
  await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 15000 })
}

/**
 * Full bootstrap: enable virtual authenticator, register a passkey for a user
 * via the backend API (no UI), and log in.
 *
 * Since seed data has been removed, this function creates a fresh user on first
 * run by calling the backend register API (userId=0 creates a new user).
 * Subsequent runs within the same test suite will reuse the user if it already
 * exists (backend matches by email).
 *
 * Returns the authenticator handle so the test can remove it in afterEach.
 *
 * @param role 'provider' (default) | 'tenant' | 'user'
 */
export async function bootstrapAuthedSession(
  page: import('playwright').Page,
  role: 'provider' | 'tenant' | 'user' = 'provider',
): Promise<VirtualAuthenticator> {
  const auth = await enableVirtualAuthenticator(page)
  const target = SEED_USERS[role]
  // Register a passkey via backend API (no UI — register page is removed).
  await registerPasskeyViaAPI(page, target.name, target.email)
  // Log in — Login.vue auto-selects the first available org and exchanges
  // for tokens, then routes by role.
  await loginWithPasskeyViaUI(page, target.email)
  return auth
}

const SEED_USERS = {
  provider: { name: '服务商管理员', email: 'admin@example.com' },
  tenant: { name: '租户管理员', email: 'tenant@example.com' },
  user: { name: '普通用户', email: 'user@example.com' },
} as const

// ---- base64url encoding helpers for WebAuthn credential serialization ----

function arrayBufferToBase64Url(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf)
  let bin = ''
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
  const base64 = btoa(bin)
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function base64UrlToBuffer(base64url: string): Uint8Array {
  const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/')
  const pad = base64.length % 4
  const padded = pad ? base64 + '='.repeat(4 - pad) : base64
  const binary = atob(padded)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}
