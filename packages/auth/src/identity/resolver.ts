/**
 * Identity Resolver —— 将 IdP 身份映射到本地用户。
 *
 * 流程（在 OIDC callback 路由中调用）：
 *   1. 查 oidc_identity_links：(provider, providerSub) → 有 link → 找 user
 *   2. 无 link + JIT 开启 → 创建 user + 创建 link
 *   3. 无 link + JIT 关闭 → 抛错（拒绝未知身份）
 *
 * SDK 提供 createDefaultIdentityResolver 默认实现。
 * App 可自行实现 IdentityResolver 接口覆盖策略（如拒绝注册、合并账户）。
 */
import type { DirectoryEntry, DirectoryStore, IdentityLink, LocalUser, OidcLinkStore, UserStore } from './types.js'

export interface IdentityResolverOptions {
  /** 首次 OIDC 登录时自动建户（默认 true） */
  jit?: boolean
}

export interface ResolveProfile {
  nickname?: string
  avatarUrl?: string
}

/** profile 回填：本地为空的字段用上游最新值补上（两个 resolver 共用） */
async function backfillProfile(
  userStore: UserStore,
  user: LocalUser,
  profile: ResolveProfile,
): Promise<LocalUser> {
  const patch: { nickname?: string; avatarUrl?: string } = {}
  if (!user.nickname && profile.nickname) patch.nickname = profile.nickname
  if (!user.avatarUrl && profile.avatarUrl) patch.avatarUrl = profile.avatarUrl
  if (Object.keys(patch).length > 0) return userStore.update(user.id, patch)
  return user
}

/**
 * Identity Resolver 接口。
 * App 可自行实现（如拒绝新注册、合并账户、审批制等）。
 */
export interface IdentityResolver {
  resolve(provider: string, providerSub: string, profile: ResolveProfile): Promise<LocalUser>
}

/**
 * 默认实现：查 link → 有则返回已有 user，无则 JIT 建户+建 link。
 * 关闭 JIT 时，无 link 抛错。
 */
export function createDefaultIdentityResolver(
  userStore: UserStore,
  linkStore: OidcLinkStore,
  opts: IdentityResolverOptions = {},
): IdentityResolver {
  const jit = opts.jit ?? true

  return {
    async resolve(provider, providerSub, profile) {
      // 1. 查已有 link
      const existing = await linkStore.findByProvider(provider, providerSub)
      if (existing) {
        const user = await userStore.findById(existing.userId)
        if (!user) {
          // link 存在但 user 被删 → 清掉孤儿 link，走 JIT 逻辑
          await linkStore.delete(existing.id)
        } else {
          // 回填上游最新的 nickname/avatarUrl（如果本地为空）
          return backfillProfile(userStore, user, profile)
        }
      }

      // 2. 无 link
      if (!jit) {
        throw new IdentityNotLinkedError(provider, providerSub)
      }

      // 3. JIT：创建 user + link
      const user = await userStore.create({
        nickname: profile.nickname ?? null,
        avatarUrl: profile.avatarUrl ?? null,
      })
      try {
        await linkStore.create({
          userId: user.id,
          provider,
          providerSub,
          rawProfile: JSON.stringify(profile),
        })
        return user
      } catch (e) {
        // 并发首次登录：同一 (provider, providerSub) 的两个回调都查到无 link、都建了 user，
        // linkStore.create 撞 UNIQUE(provider, provider_sub) 约束——一个赢一个输。
        // 输家若不清理就会留下孤儿 user，且把唯一冲突冒成 500/401。
        const winner = await linkStore.findByProvider(provider, providerSub)
        if (winner && winner.userId === user.id) {
          // 罕见：我们的 link 其实已落库（create 抛错但写入成功）→ 保留本次 user
          return user
        }
        // 别人赢了（或 link 根本没建成）→ best-effort 清理本次刚建的孤儿 user
        await userStore.delete(user.id).catch(() => {})
        if (winner) {
          const winnerUser = await userStore.findById(winner.userId)
          if (winnerUser) return winnerUser
        }
        // 不是唯一冲突，或赢家 user 也查不到 → 透传原始错误
        throw e
      }
    },
  }
}

/** 身份未关联（JIT 关闭时抛出） */
export class IdentityNotLinkedError extends Error {
  constructor(
    public readonly provider: string,
    public readonly providerSub: string,
  ) {
    super(`IdP 身份未关联: provider=${provider}, sub=${providerSub}（JIT 已关闭）`)
    this.name = 'IdentityNotLinkedError'
  }
}

// ── Directory Provisioning Resolver（目录白名单 JIT 骨架）──────────────
//
// 机制下沉、策略留 App：resolver 负责查 link → 查目录 → 调 provision 回调 →
// 建 link 的通用流程；「谁允许进来、建什么户、绑到哪」由 App 的 provision
// 回调决定（建户是 App 的信任边界，永不下沉）。

/** 目录准入被拒的原因（封闭枚举，App 据此渲染友好错误页） */
export type ProvisionBlockReason =
  /** 目录（白名单）中没有该身份 */
  | 'not_in_directory'
  /** App 的 provision 回调明确拒绝 */
  | 'declined'
  /** 回调返回的 userId 在本地不存在（App 数据漂移） */
  | 'unknown_user'

export class ProvisionBlockedError extends Error {
  constructor(
    public readonly reason: ProvisionBlockReason,
    public readonly provider: string,
    public readonly providerSub: string,
    public readonly detail?: string,
  ) {
    super(
      `身份准入被拒绝: provider=${provider}, sub=${providerSub}, reason=${reason}${detail ? `（${detail}）` : ''}`,
    )
    this.name = 'ProvisionBlockedError'
  }
}

/** 传给 provision 回调的上下文 */
export interface ProvisionRequest {
  provider: string
  sub: string
  /** 目录条目（含 name 与上游扩展快照 raw） */
  entry: DirectoryEntry
  /** 上游最新 profile（来自 IdP userinfo，可与目录数据交叉使用） */
  profile: ResolveProfile
}

/** provision 回调的决策结果 */
export type ProvisionOutcome =
  /** 准入：绑定/建户到该本地用户（App 自行决定新建还是复用） */
  { userId: string }
  /** 拒绝：附业务侧拒绝说明（如「不在任何校区」） */
  | { declined: string }

export interface DirectoryProvisioningResolverOptions {
  userStore: UserStore
  linkStore: OidcLinkStore
  directory: DirectoryStore
  /**
   * App 策略回调：目录命中后由 App 决定准入结果。
   * 典型实现：JIT 建号（username=sub、默认角色/校区）后返回 { userId }，
   * 或查目录元数据不满足业务条件时返回 { declined: '...' }。
   */
  provision(req: ProvisionRequest): Promise<ProvisionOutcome>
}

/**
 * 目录白名单 JIT 骨架：
 *   1. link 命中 → 复用已有 user（孤儿 link 清理 + profile 回填，与默认 resolver 一致）
 *   2. link 未命中 → 查目录；目录未命中 → ProvisionBlockedError('not_in_directory')
 *   3. 目录命中 → 调 App 的 provision 回调拿准入决策
 *   4. { userId } → 建 link 并返回 user；{ declined } → ProvisionBlockedError('declined')
 *
 * 与 createDefaultIdentityResolver 的区别：无目录时的兜底建户被移除——
 * 白名单外的身份一律拒绝，建户决策交给 App 回调。
 */
export function createDirectoryProvisioningResolver(
  opts: DirectoryProvisioningResolverOptions,
): IdentityResolver {
  const { userStore, linkStore, directory, provision } = opts

  return {
    async resolve(provider, providerSub, profile) {
      // 1. link 命中 → 复用
      const existing = await linkStore.findByProvider(provider, providerSub)
      if (existing) {
        const user = await userStore.findById(existing.userId)
        if (user) {
          return backfillProfile(userStore, user, profile)
        }
        // link 存在但 user 被删 → 清掉孤儿 link，重新走准入流程
        await linkStore.delete(existing.id)
      }

      // 2. 目录（白名单）判定
      const entry = await directory.findByProviderAndSub(provider, providerSub)
      if (!entry) {
        throw new ProvisionBlockedError('not_in_directory', provider, providerSub)
      }

      // 3. App 策略回调
      const outcome = await provision({ provider, sub: providerSub, entry, profile })
      if ('declined' in outcome) {
        throw new ProvisionBlockedError('declined', provider, providerSub, outcome.declined)
      }

      // 4. 建 link（并发首次登录竞态：撞唯一约束 → 以赢家 link 为准）
      const user = await userStore.findById(outcome.userId)
      if (!user) {
        throw new ProvisionBlockedError(
          'unknown_user',
          provider,
          providerSub,
          `provision 返回的 userId=${outcome.userId} 不存在`,
        )
      }
      try {
        await linkStore.create({
          userId: user.id,
          provider,
          providerSub,
          rawProfile: JSON.stringify(profile),
        })
      } catch (e) {
        const winner = await linkStore.findByProvider(provider, providerSub)
        if (winner) {
          const winnerUser = await userStore.findById(winner.userId)
          if (winnerUser) return winnerUser
        }
        throw e
      }
      return user
    },
  }
}
