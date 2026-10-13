/**
 * @homurajs/db 主入口：driver 注册制工厂 + sqlite driver（零外部依赖）+ PostgREST 层。
 *
 * 渐进式耦合：sqlite-only 的 App 只 import 本入口，不装 postgres；
 * 需要 pg/supabase 时 `import '@homurajs/db/pg'`（注册副作用）。
 *
 * PostgREST 层放在主入口而非子路径：它是零依赖的纯 fetch 实现（与 sqlite driver 同级），
 * 且是 qw-pages 形态唯一可用的数据路径（PG 直连与 node:sqlite 在 Pages 上均不可用，
 * 实测依据见 postgrest.ts 头部与 docs/specs/module-qw-pages.md）。
 */
export type { DbConfig, PgDbConfig, SqliteDbConfig, Database, PgDatabase } from './types.js'
export { createDb, registerPgDriver, isPgRegistered } from './create-db.js'
export { createSqliteDb } from './sqlite.js'
export type { SqliteDatabase } from './sqlite.js'
export { runMigrations, isSqlite } from './migrations.js'
export { defineDrizzleKitConfig } from './kit-config.js'
export { createDbTtlKv } from './ttlkv.js'
export { assertSchemaParity } from './parity.js'
export {
  createRestDb,
  loadPostgrestEnv,
  buildFilterEntries,
  buildFilterQuery,
  RestError,
} from './postgrest.js'
export type {
  RestDb,
  RestDbOptions,
  RestTable,
  RestRow,
  RestFilters,
  RestFilterValue,
  RestCondition,
  RestOp,
  RestSelectOptions,
} from './postgrest.js'
export { createRestTtlKv, REST_TTLKV_TABLE } from './rest-ttlkv.js'
export type { RestTtlKvRow, RestTtlKvOptions } from './rest-ttlkv.js'
export { restTableFromPg, restSchemaFromPg, assertRestColumns } from './rest-schema.js'
export type { RestTableDescriptor } from './rest-schema.js'
