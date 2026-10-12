/**
 * @homura/db/pg 子路径：postgres-js driver + supabase 直连构造。
 * import 本模块即注册 pg driver（副作用），App 需自行安装 postgres 依赖。
 */
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { registerPgDriver } from '../create-db.js'
import type { PgDbConfig, PgDatabase } from '../types.js'

/** 默认构造（惰性连接）：Supavisor transaction 模式强制 prepare:false */
export function createPgDb(config: PgDbConfig): PgDatabase {
  throw new Error('NotImplemented: createPgDb')
}

registerPgDriver(createPgDb)

export * from './supabase.js'
