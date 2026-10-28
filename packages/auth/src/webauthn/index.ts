/**
 * WebAuthn 子路径导出 —— 独立子路径，消费者按需引入。
 *
 * @simplewebauthn/server 是 optional peer dep，不用 WebAuthn 的 App 不需要安装。
 * 动态 import 在 provider.ts 内部处理。
 */
export { WebAuthProvider } from './provider.js'
export type {
  WebAuthProviderConfig,
  RegistrationOptions,
  AuthenticationOptions,
  RegistrationResponse,
  AuthenticationResponse,
} from './provider.js'
export { createWebAuthnRoutes } from './routes.js'
export type { WebAuthnRoutesOptions, WebAuthnPaths } from './routes.js'
export type { WebauthnCredentialStore } from './credential-store.js'
export { createDrizzleWebauthnCredentialStore } from './credential-drizzle-store.js'
