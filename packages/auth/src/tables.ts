/**
 * 双方言 auth 表定义：App 把 pgAuthTables/sqliteAuthTables spread 进
 * 自己的 schema 参与迁移（refresh_tokens 表）。
 *
 * ⚠ 列名显式 snake_case，必须与 session/store.ts 的原生 SQL 严格对齐
 *   （token_hash/family_id/sid/sub/expires_at/used_at/profile）。
 *   parity 测试只比对 pg↔sqlite 两侧一致，测不出与原生 SQL 的偏差——
 *   改列名务必同步 store.ts，并以 drizzle-kit generate 的产物为准复核。
 */
import { pgCol, pgTable, sqliteCol, sqliteTable } from '@homurajs/db/schema-helpers'
import { index } from 'drizzle-orm/pg-core'
import { index as sqliteIndex } from 'drizzle-orm/sqlite-core'

export const pgAuthTables = {
  refreshTokens: pgTable(
    'refresh_tokens',
    {
      tokenHash: pgCol.text('token_hash').primaryKey(),
      familyId: pgCol.text('family_id').notNull(),
      sid: pgCol.text('sid').notNull(),
      sub: pgCol.text('sub').notNull(),
      expiresAt: pgCol.epochMs('expires_at').notNull(),
      usedAt: pgCol.epochMs('used_at'),
      profile: pgCol.text('profile'),
    },
    (t) => [index('refresh_tokens_family_idx').on(t.familyId), index('refresh_tokens_sub_idx').on(t.sub)],
  ),
}

export const sqliteAuthTables = {
  refreshTokens: sqliteTable(
    'refresh_tokens',
    {
      tokenHash: sqliteCol.text('token_hash').primaryKey(),
      familyId: sqliteCol.text('family_id').notNull(),
      sid: sqliteCol.text('sid').notNull(),
      sub: sqliteCol.text('sub').notNull(),
      expiresAt: sqliteCol.epochMs('expires_at').notNull(),
      usedAt: sqliteCol.epochMs('used_at'),
      profile: sqliteCol.text('profile'),
    },
    (t) => [
      sqliteIndex('refresh_tokens_family_idx').on(t.familyId),
      sqliteIndex('refresh_tokens_sub_idx').on(t.sub),
    ],
  ),
}
