/**
 * db 装配：按方言建库 + 跑迁移。
 *
 * 两方言：
 * - `sqlite`：单机缺省，node:sqlite 写本地文件
 * - `pg`：自建 pgsql / 自托管 supabase（Supavisor 直连；driver 动态注册，sqlite-only 不触发副作用 import）
 */
import { createDb, runMigrations, type Database } from '@homurajs/db'
import type { AppConfig, Dialect } from './env.js'

/** 按方言建库 */
export async function buildDb(
  config: AppConfig,
  dialect: Dialect,
): Promise<{ db: Database; dialect: Dialect }> {
  if (dialect === 'sqlite') {
    const db = createDb({ dialect: 'sqlite', path: config.get('sqlitePath') })
    return { dialect, db }
  }

  // pg：动态注册 driver（副作用 import）
  await import('@homurajs/db/pg')
  const supabaseRef = config.get('supabaseProjectRef')
  const databaseUrl = config.get('databaseUrl')

  let url: string
  let prepare = true
  if (supabaseRef && config.get('supabaseDbPassword')) {
    // 自托管 supabase：Supavisor 直连
    const { buildSupabaseDbConfig } = await import('@homurajs/db/pg')
    const sb = buildSupabaseDbConfig({
      projectRef: supabaseRef,
      password: config.get('supabaseDbPassword')!,
      region: config.get('supabaseRegion'),
    })
    url = sb.url
    prepare = sb.prepare ?? true
  } else if (databaseUrl) {
    url = databaseUrl
  } else {
    throw new Error('dialect=pg 需要 DATABASE_URL 或 SUPABASE_PROJECT_REF+SUPABASE_DB_PASSWORD')
  }

  const db = createDb({ dialect: 'pg', url, prepare })
  return { dialect, db }
}

/** 迁移：跑对应方言的 drizzle 迁移（drizzle/pg 或 drizzle/sqlite） */
export async function migrate(bundle: { db: Database; dialect: Dialect }): Promise<void> {
  const folder = bundle.dialect === 'pg' ? './drizzle/pg' : './drizzle/sqlite'
  await runMigrations(bundle.db, folder)
}
