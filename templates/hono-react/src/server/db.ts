/**
 * db 装配：按 DIALECT 建库 + 选择对应方言 schema + 跑迁移。
 * 渐进式：dialect=sqlite 零 postgres 依赖；dialect=pg 才 import '@homurajs/db/pg'。
 */
import { createDb, runMigrations, type Database } from '@homurajs/db'
import type { AppConfig } from './env.js'

export interface DbBundle {
  db: Database
  dialect: 'sqlite' | 'pg'
}

/**
 * 按配置建库。pg 分支动态 import '@homurajs/db/pg'（注册 driver）——
 * sqlite-only 的 App 不触发该 import，不装 postgres 也能跑（渐进式耦合）。
 */
export async function buildDb(config: AppConfig): Promise<DbBundle> {
  const dialect = config.get('dialect')

  if (dialect === 'sqlite') {
    const db = createDb({ dialect: 'sqlite', path: config.get('sqlitePath') })
    return { db, dialect }
  }

  // pg：动态注册 driver（副作用 import）
  await import('@homurajs/db/pg')
  const supabaseRef = config.get('supabaseProjectRef')
  const databaseUrl = config.get('databaseUrl')

  let url: string
  let prepare = true
  if (supabaseRef && config.get('supabaseDbPassword')) {
    // supabase：Supavisor 直连（qw-pages 形态）
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
  return { db, dialect }
}

/** 跑对应方言的迁移（drizzle/pg 或 drizzle/sqlite） */
export async function migrate(bundle: DbBundle): Promise<void> {
  const folder = bundle.dialect === 'pg' ? './drizzle/pg' : './drizzle/sqlite'
  await runMigrations(bundle.db, folder)
}
