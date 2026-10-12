/**
 * DB 实现的 TTL-KV：多实例部署时 OAuth state 等的兜底存储。
 * take = DELETE ... RETURNING，双方言通用；秒级 expires_at（32 位安全）。
 */
import { sql, type SQL } from 'drizzle-orm'
import type { TtlKv } from '@homura/core'
import type { Database } from './types.js'
import { isSqlite } from './migrations.js'

async function exec(db: Database, q: SQL): Promise<void> {
  if (isSqlite(db)) await db.run(q)
  else await db.execute(q as never)
}

/** 返回行数组（pg execute 返回行、sqlite all 返回行） */
async function query(db: Database, q: SQL): Promise<unknown[]> {
  if (isSqlite(db)) return (await db.all(q as never)) as unknown[]
  const res = await db.execute(q as never)
  return (res as unknown as unknown[]) ?? []
}

async function ensureTable(db: Database): Promise<void> {
  // expires_at 秒级：pg integer 与 sqlite integer 均为 32 位安全
  const ddl = sql`CREATE TABLE IF NOT EXISTS homura_ttlkv (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  expires_at INTEGER NOT NULL
)`
  await exec(db, ddl)
}

export function createDbTtlKv(db: Database): TtlKv {
  const ready = ensureTable(db)

  return {
    async set(key, value, ttlMs) {
      await ready
      const expiresAt = Math.floor((Date.now() + ttlMs) / 1000)
      const upsert = sql`INSERT INTO homura_ttlkv (key, value, expires_at)
VALUES (${key}, ${value}, ${expiresAt})
ON CONFLICT (key) DO UPDATE SET value = excluded.value, expires_at = excluded.expires_at`
      // 偶尔顺带清扫过期项
      if (Math.random() < 0.05) {
        const sweep = sql`DELETE FROM homura_ttlkv WHERE expires_at <= ${Math.floor(Date.now() / 1000)}`
        await exec(db, sweep)
      }
      await exec(db, upsert)
    },

    async take(key) {
      await ready
      const now = Math.floor(Date.now() / 1000)
      const del = sql`DELETE FROM homura_ttlkv WHERE key = ${key} AND expires_at > ${now} RETURNING value`
      const rows = (await query(db, del)) as Array<{ value: string }>
      return rows.length > 0 ? (rows[0] as { value: string }).value : null
    },
  }
}
