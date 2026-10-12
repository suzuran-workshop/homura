/**
 * 迁移双轨运行时：按实例分发 drizzle 对应 migrator。
 * 生成侧用 defineDrizzleKitConfig（drizzle-kit generate）。
 * 迁移产物：PG 方言给 supabase/pgsql 共用（drizzle/pg/），SQLite 方言给 node:sqlite（drizzle/sqlite/）。
 */
import { DatabaseSync } from 'node:sqlite'
import { migrate as migratePg } from 'drizzle-orm/postgres-js/migrator'
import { migrate as migrateSqlite } from 'drizzle-orm/node-sqlite/migrator'
import type { Database, SqliteDatabase } from './types.js'

/** 运行时判定 + 类型收窄（$client 原始 client 类型判别） */
export function isSqlite(db: Database): db is SqliteDatabase {
  return (
    typeof DatabaseSync !== 'undefined' &&
    (db as unknown as { $client: unknown }).$client instanceof DatabaseSync
  )
}

export async function runMigrations(db: Database, folder: string): Promise<void> {
  if (isSqlite(db)) {
    migrateSqlite(db, { migrationsFolder: folder })
    return
  }
  await migratePg(db, { migrationsFolder: folder })
}
