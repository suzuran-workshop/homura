/**
 * SQLite 方言 schema（node:sqlite 独立单机形态）。
 * 与 pg.ts 严格对应，parity 测试锁一致（表名/列名/主键）。
 * 差异映射见 docs/specs/module-schema：boolean→integer(mode:boolean)、jsonb→text(mode:json)。
 */
import { sqliteCol, sqliteTable, sqliteJson } from '@homurajs/db/schema-helpers'
import { sqliteAuthTables } from '@homurajs/auth/tables'
import { sqliteLicenseTables } from '@homurajs/license/tables'
import { integer } from 'drizzle-orm/sqlite-core'

export const todos = sqliteTable('todos', {
  id: sqliteCol.id(),
  title: sqliteCol.text().notNull(),
  done: integer('done', { mode: 'boolean' }).notNull().default(false),
  ownerSub: sqliteCol.text(),
  createdAt: sqliteCol.createdAt(),
  meta: sqliteJson<Record<string, unknown>>(),
})

// spread 第三方表：参与本方言迁移
export const refreshTokens = sqliteAuthTables.refreshTokens
export const licenseState = sqliteLicenseTables.licenseState
// auth 多凭证身份表，与 pg.ts 严格对应
export const users = sqliteAuthTables.users
export const passwords = sqliteAuthTables.passwords
export const oidcIdentityLinks = sqliteAuthTables.oidcIdentityLinks
export const webauthnCredentials = sqliteAuthTables.webauthnCredentials

export const sqliteSchema = {
  todos,
  refreshTokens,
  licenseState,
  users,
  passwords,
  oidcIdentityLinks,
  webauthnCredentials,
}
