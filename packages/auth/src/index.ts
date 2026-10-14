// ── 核心类型 ─────────────────────────────────────────
export type { AuthUser, OAuth2Endpoints, TokenResponse } from './types.js'

// ── OAuth2 ───────────────────────────────────────────
export { OAuth2Client } from './oauth2/client.js'
export type { OAuth2ClientConfig } from './oauth2/client.js'

// ── Session ──────────────────────────────────────────
export { SessionManager } from './session/manager.js'
export type { SessionManagerConfig, SessionClaims, SessionTokens } from './session/manager.js'
export type { RefreshTokenStore } from './session/store.js'
export { createDrizzleSessionStore } from './session/store.js'
export type { DrizzleDb } from './session/store.js'
export type { RefreshTokenRecord, ConsumedToken } from './session/record.js'
export { createRestSessionStore, REFRESH_TOKENS_TABLE } from './session/rest-store.js'
export type { RestSessionStoreOptions } from './session/rest-store.js'

// ── Identity（本地用户 + OAuth2 关联）────────────────
export type { LocalUser, IdentityLink, UserStore, OAuth2LinkStore } from './identity/types.js'
export { createDrizzleUserStore } from './identity/user-store.js'
export { createDrizzleOAuth2LinkStore } from './identity/oauth2-link-store.js'
export { createRestUserStore } from './identity/user-rest-store.js'
export type { RestUserStoreOptions } from './identity/user-rest-store.js'
export { createRestOAuth2LinkStore } from './identity/oauth2-link-rest-store.js'
export type { RestOAuth2LinkStoreOptions } from './identity/oauth2-link-rest-store.js'

// ── Identity Resolver（OAuth2 → local user 桥接）────
export {
  createDefaultIdentityResolver,
  IdentityNotLinkedError,
} from './identity/resolver.js'
export type {
  IdentityResolver,
  IdentityResolverOptions,
  ResolveProfile,
} from './identity/resolver.js'

// ── Password ─────────────────────────────────────────
export { PasswordProvider } from './password/provider.js'
export type { PasswordProviderOptions } from './password/provider.js'
export type { PasswordRecord, PasswordStore } from './password/store.js'
export { createDrizzlePasswordStore } from './password/drizzle-store.js'
export { createRestPasswordStore, PASSWORDS_TABLE } from './password/rest-store.js'
export type { RestPasswordStoreOptions } from './password/rest-store.js'

// ── WebAuthn ─────────────────────────────────────────
export type { WebauthnCredentialStore } from './webauthn/credential-store.js'
export { createDrizzleWebauthnCredentialStore } from './webauthn/credential-drizzle-store.js'
export { createRestWebauthnCredentialStore, WEBAUTHN_CREDENTIALS_TABLE } from './webauthn/credential-rest-store.js'
export type { RestWebauthnCredentialStoreOptions } from './webauthn/credential-rest-store.js'
export { WebAuthProvider } from './webauthn/provider.js'
export type {
  WebAuthProviderConfig,
  RegistrationOptions,
  AuthenticationOptions,
  RegistrationResponse,
  AuthenticationResponse,
} from './webauthn/provider.js'
