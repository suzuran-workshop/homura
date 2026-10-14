/**
 * OAuth2 Identity Resolver —— 将 IdP 身份映射到本地用户。
 *
 * 流程（在 OAuth2 callback 路由中调用）：
 *   1. 查 oauth2_identity_links：(provider, providerSub) → 有 link → 找 user
 *   2. 无 link + JIT 开启 → 创建 user + 创建 link
 *   3. 无 link + JIT 关闭 → 抛错（拒绝未知身份）
 *
 * SDK 提供 createDefaultIdentityResolver 默认实现。
 * App 可自行实现 IdentityResolver 接口覆盖策略（如拒绝注册、合并账户）。
 */
import type { IdentityLink, LocalUser, OAuth2LinkStore, UserStore } from './types.js'

export interface IdentityResolverOptions {
  /** 首次 OAuth2 登录时自动建户（默认 true） */
  jit?: boolean
}

export interface ResolveProfile {
  nickname?: string
  avatarUrl?: string
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
  linkStore: OAuth2LinkStore,
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
          const patch: { nickname?: string; avatarUrl?: string } = {}
          if (!user.nickname && profile.nickname) patch.nickname = profile.nickname
          if (!user.avatarUrl && profile.avatarUrl) patch.avatarUrl = profile.avatarUrl
          if (Object.keys(patch).length > 0) {
            return userStore.update(user.id, patch)
          }
          return user
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
    super(`OAuth2 身份未关联: provider=${provider}, sub=${providerSub}（JIT 已关闭）`)
    this.name = 'IdentityNotLinkedError'
  }
}
