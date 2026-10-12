import { sql } from 'drizzle-orm'
import { isSqlite } from '@homura/db'
import type { NodeSQLiteDatabase } from 'drizzle-orm/node-sqlite'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import type { ConsumedToken, RefreshTokenRecord } from './record.js'

/** 双方言数据库实例（与 @homura/db 的 Database 结构一致，但保持本包 peer 边界独立） */
export type DrizzleDb = PostgresJsDatabase | NodeSQLiteDatabase

export interface RefreshTokenStore {
  create(r: RefreshTokenRecord): Promise<void>
  /** 一次性消费：原子标记已用并返回记录；已消费过的返回 revoked:true（复用信号） */
  consume(tokenHash: string): Promise<ConsumedToken | null>
  revokeFamily(familyId: string): Promise<void>
  revokeUser(sub: string): Promise<void>
}

async function exec(db: DrizzleDb, q: ReturnType<typeof sql>): Promise<void> {
  if (isSqlite(db)) await db.run(q)
  else await db.execute(q as never)
}

async function query<T>(db: DrizzleDb, q: ReturnType<typeof sql>): Promise<T[]> {
  if (isSqlite(db)) return (await db.all(q as never)) as T[]
  const res = await db.execute(q as never)
  return (res as unknown as T[]) ?? []
}

/**
 * drizzle 双方言实现（表定义见 @homura/auth/tables，App spread 进 schema 迁移）。
 * consume 用 UPDATE ... RETURNING 原子标记 used_at，已 used 的行返回 revoked:true。
 */
export function createDrizzleSessionStore(db: DrizzleDb, opts?: { now?: () => number }): RefreshTokenStore {
  const now = opts?.now ?? (() => Date.now())

  return {
    async create(r) {
      await exec(
        db,
        sql`INSERT INTO refresh_tokens (token_hash, family_id, sid, sub, expires_at, profile)
VALUES (${r.tokenHash}, ${r.familyId}, ${r.sid}, ${r.sub}, ${r.expiresAt}, ${r.profile ?? null})`,
      )
    },

    async consume(tokenHash) {
      const ts = now()
      // 原子抢占：仅当未被消费过（used_at IS NULL）且未过期时标记已用。
      // 注意 UPDATE...RETURNING 返回的是更新后的值，故不能用 used_at 事后判复用，
      // 必须用「抢占是否成功（有无 RETURNING 行）」来区分首次消费与复用。
      const claimRows = await query<{
        family_id: string
        sid: string
        sub: string
        profile: string | null
      }>(
        db,
        sql`UPDATE refresh_tokens
SET used_at = ${ts}
WHERE token_hash = ${tokenHash} AND expires_at > ${ts} AND used_at IS NULL
RETURNING family_id, sid, sub, profile`,
      )
      const claimed = claimRows[0]
      if (claimed) {
        return {
          familyId: claimed.family_id,
          sid: claimed.sid,
          sub: claimed.sub,
          profile: claimed.profile,
          revoked: false,
        }
      }
      // 抢占失败：查原因——不存在 / 已过期 / 已被消费（复用）
      const rows = await query<{ family_id: string; used_at: number | null }>(
        db,
        sql`SELECT family_id, used_at FROM refresh_tokens WHERE token_hash = ${tokenHash}`,
      )
      const row = rows[0]
      if (!row) return null // 不存在
      if (row.used_at !== null) {
        // 复用检出：该 token 此前已被消费（盗用信号，manager 会吊销整族）
        return { familyId: row.family_id, sid: '', sub: '', profile: null, revoked: true }
      }
      return null // 存在但未消费 → 只能是已过期
    },

    async revokeFamily(familyId) {
      await exec(
        db,
        sql`UPDATE refresh_tokens SET used_at = ${now()} WHERE family_id = ${familyId} AND used_at IS NULL`,
      )
    },

    async revokeUser(sub) {
      await exec(
        db,
        sql`UPDATE refresh_tokens SET used_at = ${now()} WHERE sub = ${sub} AND used_at IS NULL`,
      )
    },
  }
}
