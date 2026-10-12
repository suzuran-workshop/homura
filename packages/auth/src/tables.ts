/**
 * 双方言 auth 表定义：App 把 pgAuthTables/sqliteAuthTables spread 进
 * 自己的 schema 参与迁移（refresh_tokens 表）。
 */
import { pgCol, pgTable, sqliteCol, sqliteTable } from '@homura/db/schema-helpers'
import { index } from 'drizzle-orm/pg-core'
import { index as sqliteIndex } from 'drizzle-orm/sqlite-core'

export const pgAuthTables = {
  refreshTokens: pgTable(
    'refresh_tokens',
    {
      tokenHash: pgCol.text().primaryKey(),
      familyId: pgCol.text().notNull(),
      sid: pgCol.text().notNull(),
      sub: pgCol.text().notNull(),
      expiresAt: pgCol.createdAt(),
      revokedAt: pgCol.createdAt(),
    },
    (t) => [index('refresh_tokens_family_idx').on(t.familyId), index('refresh_tokens_sub_idx').on(t.sub)],
  ),
}

export const sqliteAuthTables = {
  refreshTokens: sqliteTable(
    'refresh_tokens',
    {
      tokenHash: sqliteCol.text().primaryKey(),
      familyId: sqliteCol.text().notNull(),
      sid: sqliteCol.text().notNull(),
      sub: sqliteCol.text().notNull(),
      expiresAt: sqliteCol.createdAt(),
      revokedAt: sqliteCol.createdAt(),
    },
    (t) => [
      sqliteIndex('refresh_tokens_family_idx').on(t.familyId),
      sqliteIndex('refresh_tokens_sub_idx').on(t.sub),
    ],
  ),
}
