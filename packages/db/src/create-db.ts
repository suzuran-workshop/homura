import type { Database, DbConfig, PgDatabase } from './types.js'
import { createSqliteDb } from './sqlite.js'

/**
 * driver 注册制：pg driver 位于子路径 '@homura/db/pg'（import 即注册），
 * sqlite driver 内置。保证 sqlite-only App 零 postgres 依赖（渐进式耦合）。
 */
type PgDriverFactory = (config: Extract<DbConfig, { dialect: 'pg' }>) => PgDatabase

let pgDriver: PgDriverFactory | null = null

/** 由 '@homura/db/pg' 子路径模块调用（App 一般不直接调用） */
export function registerPgDriver(factory: PgDriverFactory): void {
  pgDriver = factory
}

export function isPgRegistered(): boolean {
  return pgDriver !== null
}

/** 同步构造：postgres-js 惰性连接、node:sqlite 同步打开；失败抛错 */
export function createDb(config: DbConfig): Database {
  if (config.dialect === 'sqlite') return createSqliteDb(config)
  if (!pgDriver) {
    throw new Error(
      "pg driver 未注册：请 `import '@homura/db/pg'`（并安装 postgres 依赖），或改用 dialect: 'sqlite'",
    )
  }
  return pgDriver(config)
}
