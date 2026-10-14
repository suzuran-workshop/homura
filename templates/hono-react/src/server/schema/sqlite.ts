/**
 * SQLite 方言 schema（node:sqlite 独立单机形态）。
 * 与 pg.ts 严格对应，parity 测试锁一致（表名/列名/主键）。
 * 差异映射见 docs/specs/module-schema：boolean→integer(mode:boolean)、jsonb→text(mode:json)。
 */
import { sqliteCol, sqliteTable, sqliteJson } from '@homurajs/db/schema-helpers'
import { sqliteAuthTables } from '@homurajs/auth/tables'
import { sqliteLicenseTables } from '@homurajs/license/tables'
import { sqliteStorageTables } from '@homurajs/storage/tables'
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
// DB-backed storage 的 homura_files（清单）+ homura_file_chunks（数据分块），与 pg.ts 严格对应
export const homuraFiles = sqliteStorageTables.homuraFiles
export const homuraFileChunks = sqliteStorageTables.homuraFileChunks

export const sqliteSchema = { todos, refreshTokens, licenseState, homuraFiles, homuraFileChunks }
