/**
 * PG 方言 schema（pgsql 独立部署 + supabase 共用）。
 * 业务表 todos + spread 进 auth/license 的第三方表（refresh_tokens / license_state）
 * + auth 新表（users / passwords / oauth2_identity_links / webauthn_credentials）。
 * 与 sqlite.ts 严格对应，parity 测试锁一致。
 */
import { pgCol, pgTable, pgJson } from '@homurajs/db/schema-helpers'
import { pgAuthTables } from '@homurajs/auth/tables'
import { pgLicenseTables } from '@homurajs/license/tables'
import { pgStorageTables } from '@homurajs/storage/tables'
import { boolean } from 'drizzle-orm/pg-core'

export const todos = pgTable('todos', {
  id: pgCol.id(),
  title: pgCol.text().notNull(),
  done: boolean('done').notNull().default(false),
  ownerSub: pgCol.text(),
  createdAt: pgCol.createdAt(),
  meta: pgJson<Record<string, unknown>>(),
})

// spread 第三方表：参与本方言迁移
export const refreshTokens = pgAuthTables.refreshTokens
export const licenseState = pgLicenseTables.licenseState
// DB-backed storage 的 homura_files（清单）+ homura_file_chunks（数据分块）
// （STORAGE_BACKEND=db 时用；表恒迁移，requiredTables 按后端条件纳入）
export const homuraFiles = pgStorageTables.homuraFiles
export const homuraFileChunks = pgStorageTables.homuraFileChunks
// auth 多凭证身份表（TextPassword + WebAuthn + OAuth2 identity links）
export const users = pgAuthTables.users
export const passwords = pgAuthTables.passwords
export const oauth2IdentityLinks = pgAuthTables.oauth2IdentityLinks
export const webauthnCredentials = pgAuthTables.webauthnCredentials

export const pgSchema = {
  todos,
  refreshTokens,
  licenseState,
  homuraFiles,
  homuraFileChunks,
  users,
  passwords,
  oauth2IdentityLinks,
  webauthnCredentials,
}
