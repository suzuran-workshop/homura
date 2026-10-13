import { sql } from 'drizzle-orm'
import type { NodeSQLiteDatabase } from 'drizzle-orm/node-sqlite'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import { isSqlite } from '@homurajs/db'

// 表定义已抽到 ./tables.ts（./tables 子路径），此处 re-export 保持向后兼容
export { pgLicenseTables, sqliteLicenseTables } from './tables.js'

export interface LicenseState {
  licenseId?: string
  instanceKey: string
}

export interface LicenseStateStore {
  load(): Promise<LicenseState | null>
  save(state: LicenseState): Promise<void>
}

export type DrizzleDb = PostgresJsDatabase | NodeSQLiteDatabase

/** 自建表（CREATE IF NOT EXISTS）+ 双方言 upsert/读取 */
export function createDrizzleStateStore(db: DrizzleDb): LicenseStateStore {
  const ready = (async () => {
    const ddl = sql`CREATE TABLE IF NOT EXISTS license_state (
  id TEXT PRIMARY KEY,
  license_id TEXT,
  instance_key TEXT NOT NULL,
  updated_at INTEGER NOT NULL DEFAULT 0
)`
    if (isSqlite(db as never)) await (db as NodeSQLiteDatabase).run(ddl)
    else await (db as PostgresJsDatabase).execute(ddl as never)
  })()

  return {
    async load() {
      await ready
      const q = sql`SELECT license_id, instance_key FROM license_state WHERE id = 'default'`
      let rows: Array<{ license_id: string | null; instance_key: string }>
      if (isSqlite(db as never)) {
        rows = (await (db as NodeSQLiteDatabase).all(q as never)) as unknown as typeof rows
      } else {
        const res = await (db as PostgresJsDatabase).execute(q as never)
        rows = (res as unknown as typeof rows) ?? []
      }
      const row = rows[0]
      if (!row) return null
      return { licenseId: row.license_id ?? undefined, instanceKey: row.instance_key }
    },

    async save(state) {
      await ready
      const ts = Math.floor(Date.now() / 1000)
      const q = sql`INSERT INTO license_state (id, license_id, instance_key, updated_at)
VALUES ('default', ${state.licenseId ?? null}, ${state.instanceKey}, ${ts})
ON CONFLICT (id) DO UPDATE SET license_id = excluded.license_id, instance_key = excluded.instance_key, updated_at = excluded.updated_at`
      if (isSqlite(db as never)) await (db as NodeSQLiteDatabase).run(q)
      else await (db as PostgresJsDatabase).execute(q as never)
    },
  }
}
