/**
 * @homura/db/pg 子路径：postgres-js driver + supabase 直连构造。
 * import 本模块即注册 pg driver（副作用），App 需自行安装 postgres 依赖。
 */
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { registerPgDriver } from '../create-db.js'
import type { PgDbConfig, PgDatabase } from '../types.js'

/** 默认构造（惰性连接）；Supavisor transaction 模式需 prepare:false（见 supabase.ts） */
export function createPgDb(config: PgDbConfig): PgDatabase {
  const sql = postgres(config.url, {
    max: config.max ?? 10,
    idle_timeout: config.idleTimeout ?? 30,
    prepare: config.prepare ?? true,
    ...(config.ssl === true ? { ssl: 'require' as const } : {}),
  })
  return drizzle({ client: sql })
}

registerPgDriver(createPgDb)

export * from './supabase.js'
