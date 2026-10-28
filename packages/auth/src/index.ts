// ── 核心类型 ─────────────────────────────────────────
export type { AuthUser, OidcEndpoints, OidcTokenResponse } from './types.js'

// ── OIDC ─────────────────────────────────────────────
export { OidcClient, OidcError } from './oidc/client.js'
export type { OidcClientConfig, OidcClaims } from './oidc/client.js'

// ── Session ──────────────────────────────────────────
export { SessionManager } from './session/manager.js'
export type { SessionManagerConfig, SessionClaims, SessionTokens } from './session/manager.js'
export type { RefreshTokenStore } from './session/store.js'
export { createDrizzleSessionStore } from './session/store.js'
export type { DrizzleDb } from './session/store.js'
export type { RefreshTokenRecord, ConsumedToken } from './session/record.js'

// ── Identity（本地用户 + IdP 关联）────────────────
export type {
  LocalUser,
  IdentityLink,
  UserStore,
  OAuth2LinkStore,
  DirectoryEntry,
  DirectoryStore,
} from './identity/types.js'
export { createDrizzleUserStore } from './identity/user-store.js'
export { createDrizzleOAuth2LinkStore } from './identity/oauth2-link-store.js'
export { createDrizzleDirectoryStore } from './identity/directory-store.js'

// ── Identity Resolver（IdP sub → local user 桥接）────
export {
  createDefaultIdentityResolver,
  createDirectoryProvisioningResolver,
  IdentityNotLinkedError,
  ProvisionBlockedError,
} from './identity/resolver.js'
export type {
  IdentityResolver,
  IdentityResolverOptions,
  ResolveProfile,
  ProvisionBlockReason,
  ProvisionRequest,
  ProvisionOutcome,
  DirectoryProvisioningResolverOptions,
} from './identity/resolver.js'

// ── Password ─────────────────────────────────────────
export { PasswordProvider, UsernameTakenError } from './password/provider.js'
export type { PasswordProviderOptions } from './password/provider.js'
export type { PasswordRecord, PasswordStore } from './password/store.js'
export { createDrizzlePasswordStore } from './password/drizzle-store.js'

// ── WebAuthn ─────────────────────────────────────────
export type { WebauthnCredentialStore } from './webauthn/credential-store.js'
export { createDrizzleWebauthnCredentialStore } from './webauthn/credential-drizzle-store.js'
export { WebAuthProvider } from './webauthn/provider.js'
export type {
  WebAuthProviderConfig,
  RegistrationOptions,
  AuthenticationOptions,
  RegistrationResponse,
  AuthenticationResponse,
} from './webauthn/provider.js'
