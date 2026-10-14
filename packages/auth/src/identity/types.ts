/**
 * 本地身份模型核心类型。
 *
 * - `users` 表是身份锚点：三类凭证（TextPassword / WebAuthn / OAuth2 identity link）
 *   都指向它，session 的 sub 也是 local user.id（不再是 IdP subject）。
 * - OAuth2-only 用户的 username 可为 null（没有密码登录能力）。
 */

/** 本地用户（users 表行） */
export interface LocalUser {
  id: string
  username: string | null
  nickname: string | null
  avatarUrl: string | null
  createdAt: number
  updatedAt: number
}

/** OAuth2 身份关联（oauth2_identity_links 表行） */
export interface IdentityLink {
  id: string
  userId: string
  provider: string
  providerSub: string
  rawProfile: string | null
  createdAt: number
}

/** 密码凭证（passwords 表行） */
export interface PasswordRecord {
  userId: string
  passwordHash: string
  createdAt: number
  updatedAt: number
}

/** WebAuthn 凭证（webauthn_credentials 表行） */
export interface WebauthnCredentialRecord {
  id: string
  userId: string
  publicKey: string
  counter: number
  deviceType: string
  backedUp: number
  transports: string | null
  displayName: string | null
  createdAt: number
}

/**
 * 用户仓储：三类凭证 + identity resolver 共用。
 * Drizzle 双方言与 PostgREST 两版实现共享此接口。
 */
export interface UserStore {
  /** 按 id 查用户；不存在返回 null */
  findById(id: string): Promise<LocalUser | null>
  /** 按 username 查用户（精确匹配）；不存在返回 null */
  findByUsername(username: string): Promise<LocalUser | null>
  /** 创建用户；username 重复抛唯一约束冲突 */
  create(input: { username?: string | null; nickname?: string | null; avatarUrl?: string | null }): Promise<LocalUser>
  /** 更新 nickname/avatarUrl（部分更新，不传字段不动） */
  update(id: string, patch: { nickname?: string; avatarUrl?: string }): Promise<LocalUser>
}

/**
 * OAuth2 身份关联仓储。
 * 用于 identity resolver 在 callback 时查 link → 找 user，或 JIT 建户时创建 link。
 */
export interface OAuth2LinkStore {
  /** 按 (provider, providerSub) 查关联；不存在返回 null */
  findByProvider(provider: string, providerSub: string): Promise<IdentityLink | null>
  /** 按 userId 查所有关联 */
  findByUserId(userId: string): Promise<IdentityLink[]>
  /** 创建关联；(provider, providerSub) 唯一约束冲突抛错 */
  create(input: {
    userId: string
    provider: string
    providerSub: string
    rawProfile?: string | null
  }): Promise<IdentityLink>
  /** 删除关联 */
  delete(id: string): Promise<void>
}
