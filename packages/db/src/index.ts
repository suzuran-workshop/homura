/**
 * @homura/db 主入口：driver 注册制工厂 + sqlite driver（零外部依赖）。
 *
 * 渐进式耦合：sqlite-only 的 App 只 import 本入口，不装 postgres；
 * 需要 pg/supabase 时 `import '@homura/db/pg'`（注册副作用）。
 */
export type { DbConfig, PgDbConfig, SqliteDbConfig, Database, PgDatabase } from './types.js'
export { createDb, registerPgDriver, isPgRegistered } from './create-db.js'
export { createSqliteDb } from './sqlite.js'
export type { SqliteDatabase } from './sqlite.js'
export { runMigrations, isSqlite } from './migrations.js'
export { defineDrizzleKitConfig } from './kit-config.js'
export { createDbTtlKv } from './ttlkv.js'
export { assertSchemaParity } from './parity.js'
