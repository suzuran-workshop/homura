/**
 * PostgREST 版 RefreshTokenStore —— qw-pages（dialect=rest）形态用。
 *
 * 与 drizzle 版（./store.ts）语义严格对齐，最关键的是 consume 的**原子抢占**：
 *   SQL 版：UPDATE refresh_tokens SET used_at=ts
 *           WHERE token_hash=? AND expires_at>ts AND used_at IS NULL
 *           RETURNING family_id, sid, sub, profile
 *   REST 版：PATCH /refresh_tokens?token_hash=eq.X&expires_at=gt.ts&used_at=is.null
 *           body {"used_at":ts} + Prefer: return=representation
 * PostgREST 会把它翻译成同一条带 WHERE 的 UPDATE...RETURNING，故「返回空数组 = 抢占失败」
 * 与 SQL 版「无 RETURNING 行」判定完全一致——延续教训 8「先占后判，不能先改后读」。
 *
 * ⚠ 列名是显式 snake_case（见 ../tables.ts），与 drizzle 版共用同一张表。
 * ⚠ 表与 RLS policy 须由部署期的平台受控迁移创建：App 侧无 DDL 权限，
 *   且 RLS 缺 policy 时 PostgREST 是静默失败（SELECT 返回 200 空数组）。
 */
import type { RestDb } from '@homurajs/db'
import type { ConsumedToken, RefreshTokenRecord } from './record.js'
import type { RefreshTokenStore } from './store.js'

export const REFRESH_TOKENS_TABLE = 'refresh_tokens'

/** PostgREST 返回的行：键 = PG 真实列名（snake_case）；bigint 可能是 number 或字符串 */
interface RefreshTokenRow {
  token_hash: string
  family_id: string
  sid: string
  sub: string
  expires_at: number | string
  used_at: number | string | null
  profile: string | null
  [column: string]: unknown
}

export interface RestSessionStoreOptions {
  table?: string
  now?: () => number
}

export function createRestSessionStore(
  rest: RestDb,
  opts: RestSessionStoreOptions = {},
): RefreshTokenStore {
  const t = rest.table<RefreshTokenRow>(opts.table ?? REFRESH_TOKENS_TABLE)
  const now = opts.now ?? (() => Date.now())
  const isUsed = (v: number | string | null | undefined): boolean => v !== null && v !== undefined

  return {
    async create(r: RefreshTokenRecord): Promise<void> {
      // used_at 不传 → 保持 NULL（未消费）
      await t.insert({
        token_hash: r.tokenHash,
        family_id: r.familyId,
        sid: r.sid,
        sub: r.sub,
        expires_at: r.expiresAt,
        profile: r.profile ?? null,
      })
    },

    async consume(tokenHash: string): Promise<ConsumedToken | null> {
      const ts = now()
      // ① 原子抢占：只有「未消费且未过期」的行会被更新并返回
      const claimed = await t.update(
        { used_at: ts },
        {
          token_hash: tokenHash,
          expires_at: { op: 'gt', value: ts },
          used_at: null, // → used_at=is.null
        },
      )
      const hit = claimed[0]
      if (hit) {
        return {
          familyId: hit.family_id,
          sid: hit.sid,
          sub: hit.sub,
          profile: hit.profile,
          revoked: false,
        }
      }

      // ② 抢占失败：查原因——不存在 / 已过期 / 已被消费（复用信号）
      const rows = await t.select(
        { token_hash: tokenHash },
        { columns: 'family_id,used_at', limit: 1 },
      )
      const row = rows[0]
      if (!row) return null // 不存在
      if (isUsed(row.used_at)) {
        // 复用检出：该 token 此前已被消费（盗用信号，manager 会吊销整族）
        return { familyId: row.family_id, sid: '', sub: '', profile: null, revoked: true }
      }
      return null // 存在但未消费 → 只能是已过期
    },

    async revokeFamily(familyId: string): Promise<void> {
      await t.update({ used_at: now() }, { family_id: familyId, used_at: null })
    },

    async revokeUser(sub: string): Promise<void> {
      await t.update({ used_at: now() }, { sub, used_at: null })
    },
  }
}
