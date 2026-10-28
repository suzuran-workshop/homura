/**
 * 本地身份模型核心类型。
 *
 * - `users` 表是身份锚点：三类凭证（TextPassword / WebAuthn / IdP identity link）
 *   都指向它，session 的 sub 也是 local user.id（不再是 IdP subject）。
 * - 纯 OIDC 登录用户的 username 可为 null（没有密码登录能力）。
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

/** IdP 身份关联（oidc_identity_links 表行） */
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
 * Drizzle 双方言（pg/sqlite）实现共享此接口。
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
  /**
   * 删除用户（按 id）。用于注册失败时清理孤儿 user（见 PasswordProvider.register）。
   * ⚠ 不级联删除凭证记录（passwords/oidc_identity_links/webauthn_credentials）——
   *   调用方自行保证只在「刚建、尚无凭证」的 user 上调用，或先清凭证再删 user。
   */
  delete(id: string): Promise<void>
}

/**
 * IdP 身份关联仓储（oidc_identity_links 表）。
 * 用于 identity resolver 在 callback 时查 link → 找 user，或 JIT 建户时创建 link。
 */
export interface OidcLinkStore {
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

/** 外部身份目录条目（identity_directory 表行） */
export interface DirectoryEntry {
  id: string
  provider: string
  sub: string
  name: string | null
  /** 上游快照的扩展信息（JSON 文本，形状由来源决定，homura 不解释） */
  raw: string | null
  createdAt: number
  updatedAt: number
}

/**
 * 外部身份目录仓储：App 把上游身份来源（如钉钉通讯录）快照 upsert 进来，
 * resolver 以它为白名单做 JIT 准入。homura 只管通用形状，不关心来源。
 */
export interface DirectoryStore {
  /**
   * upsert 一条目录条目（同步快照用）：
   * (provider, sub) 已存在则更新 name/raw，否则新建。
   */
  upsert(input: { provider: string; sub: string; name?: string | null; raw?: string | null }): Promise<DirectoryEntry>
  /** 按 (provider, sub) 查条目；不存在返回 null */
  findByProviderAndSub(provider: string, sub: string): Promise<DirectoryEntry | null>
  /** 按 provider 列出全部条目（快照对账用） */
  listByProvider(provider: string): Promise<DirectoryEntry[]>
  /** 删除一条目录条目 */
  remove(provider: string, sub: string): Promise<void>
}
