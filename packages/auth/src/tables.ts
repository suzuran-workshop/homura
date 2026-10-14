/**
 * 双方言 auth 表定义：App 把 pgAuthTables/sqliteAuthTables spread 进
 * 自己的 schema 参与迁移。
 *
 * 包含五张表：
 * - `refresh_tokens`：session refresh token（rotate + family 吊销）
 * - `users`：本地身份锚点（密码/WebAuthn/OAuth2 共享）
 * - `passwords`：密码凭证（1:1 users）
 * - `oauth2_identity_links`：OAuth2 身份关联（1:N users）
 * - `webauthn_credentials`：WebAuthn 凭证（1:N users）
 *
 * ⚠ 列名显式 snake_case，必须与各 store 的原生 SQL / PostgREST 列名严格对齐。
 *   parity 测试只比对 pg↔sqlite 两侧一致，测不出与原生 SQL 的偏差——
 *   改列名务必同步 store 实现，并以 drizzle-kit generate 的产物为准复核。
 */
import { pgCol, pgTable, sqliteCol, sqliteTable } from '@homurajs/db/schema-helpers'
import { index, uniqueIndex } from 'drizzle-orm/pg-core'
import { index as sqliteIndex, uniqueIndex as sqliteUniqueIndex } from 'drizzle-orm/sqlite-core'

export const USERS_TABLE = 'users'
export const PASSWORDS_TABLE = 'passwords'
export const OAUTH2_IDENTITY_LINKS_TABLE = 'oauth2_identity_links'
export const WEBAUTHN_CREDENTIALS_TABLE = 'webauthn_credentials'

// ── refresh_tokens（原有）──────────────────────────────

const pgRefreshTokens = pgTable(
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
)

const sqliteRefreshTokens = sqliteTable(
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
)

// ── users（身份锚点）──────────────────────────────────
//
// ⚠ username 唯一性走**显式唯一索引**，不用 inline `.unique()`：
//   drizzle-kit rc.4 的 sqlite 生成器不落列级 inline UNIQUE（pg 落），
//   实测 `sqliteCol.text('username').unique()` 产出的迁移里 username 只是普通 `text`，
//   唯一约束静默丢失 → standalone（缺省 sqlite）部署可注册重复用户名，
//   密码注册的「username 重复 → 409」路径永远不触发。
//   双方言统一用唯一索引表达才对称、才都能产出约束（唯一索引同时服务 findByUsername 等值查询）。
//   注：sqlite **运行时**认 inline UNIQUE（测试手建 DDL 无碍），丢约束只发生在 kit 生成迁移这一环。

const pgUsers = pgTable(
  USERS_TABLE,
  {
    id: pgCol.id('id'),
    username: pgCol.text('username'),
    nickname: pgCol.text('nickname'),
    avatarUrl: pgCol.text('avatar_url'),
    createdAt: pgCol.epochMs('created_at').notNull(),
    updatedAt: pgCol.epochMs('updated_at').notNull(),
  },
  (t) => [uniqueIndex('users_username_uidx').on(t.username)],
)

const sqliteUsers = sqliteTable(
  USERS_TABLE,
  {
    id: sqliteCol.id('id'),
    username: sqliteCol.text('username'),
    nickname: sqliteCol.text('nickname'),
    avatarUrl: sqliteCol.text('avatar_url'),
    createdAt: sqliteCol.epochMs('created_at').notNull(),
    updatedAt: sqliteCol.epochMs('updated_at').notNull(),
  },
  (t) => [sqliteUniqueIndex('users_username_uidx').on(t.username)],
)

// ── passwords（1:1 user_id 即 PK）────────────────────

const pgPasswords = pgTable(PASSWORDS_TABLE, {
  userId: pgCol.text('user_id').primaryKey(),
  passwordHash: pgCol.text('password_hash').notNull(),
  createdAt: pgCol.epochMs('created_at').notNull(),
  updatedAt: pgCol.epochMs('updated_at').notNull(),
})

const sqlitePasswords = sqliteTable(PASSWORDS_TABLE, {
  userId: sqliteCol.text('user_id').primaryKey(),
  passwordHash: sqliteCol.text('password_hash').notNull(),
  createdAt: sqliteCol.epochMs('created_at').notNull(),
  updatedAt: sqliteCol.epochMs('updated_at').notNull(),
})

// ── oauth2_identity_links（1:N，UNIQUE provider+sub）──

const pgOAuth2IdentityLinks = pgTable(
  OAUTH2_IDENTITY_LINKS_TABLE,
  {
    id: pgCol.id('id'),
    userId: pgCol.text('user_id').notNull(),
    provider: pgCol.text('provider').notNull(),
    providerSub: pgCol.text('provider_sub').notNull(),
    rawProfile: pgCol.text('raw_profile'),
    createdAt: pgCol.epochMs('created_at').notNull(),
  },
  (t) => [
    index('oauth2_links_user_idx').on(t.userId),
    uniqueIndex('oauth2_links_provider_sub_uidx').on(t.provider, t.providerSub),
  ],
)

const sqliteOAuth2IdentityLinks = sqliteTable(
  OAUTH2_IDENTITY_LINKS_TABLE,
  {
    id: sqliteCol.id('id'),
    userId: sqliteCol.text('user_id').notNull(),
    provider: sqliteCol.text('provider').notNull(),
    providerSub: sqliteCol.text('provider_sub').notNull(),
    rawProfile: sqliteCol.text('raw_profile'),
    createdAt: sqliteCol.epochMs('created_at').notNull(),
  },
  (t) => [
    sqliteIndex('oauth2_links_user_idx').on(t.userId),
    sqliteUniqueIndex('oauth2_links_provider_sub_uidx').on(t.provider, t.providerSub),
  ],
)

// ── webauthn_credentials（1:N）────────────────────────

const pgWebauthnCredentials = pgTable(
  WEBAUTHN_CREDENTIALS_TABLE,
  {
    id: pgCol.text('id').primaryKey(),
    userId: pgCol.text('user_id').notNull(),
    publicKey: pgCol.text('public_key').notNull(),
    counter: pgCol.int('counter').notNull(),
    deviceType: pgCol.text('device_type').notNull(),
    backedUp: pgCol.int('backed_up').notNull(),
    transports: pgCol.text('transports'),
    displayName: pgCol.text('display_name'),
    createdAt: pgCol.epochMs('created_at').notNull(),
  },
  (t) => [index('webauthn_creds_user_idx').on(t.userId)],
)

const sqliteWebauthnCredentials = sqliteTable(
  WEBAUTHN_CREDENTIALS_TABLE,
  {
    id: sqliteCol.text('id').primaryKey(),
    userId: sqliteCol.text('user_id').notNull(),
    publicKey: sqliteCol.text('public_key').notNull(),
    counter: sqliteCol.int('counter').notNull(),
    deviceType: sqliteCol.text('device_type').notNull(),
    backedUp: sqliteCol.int('backed_up').notNull(),
    transports: sqliteCol.text('transports'),
    displayName: sqliteCol.text('display_name'),
    createdAt: sqliteCol.epochMs('created_at').notNull(),
  },
  (t) => [sqliteIndex('webauthn_creds_user_idx').on(t.userId)],
)

// ── 导出 ──────────────────────────────────────────────

export const pgAuthTables = {
  refreshTokens: pgRefreshTokens,
  users: pgUsers,
  passwords: pgPasswords,
  oauth2IdentityLinks: pgOAuth2IdentityLinks,
  webauthnCredentials: pgWebauthnCredentials,
}

export const sqliteAuthTables = {
  refreshTokens: sqliteRefreshTokens,
  users: sqliteUsers,
  passwords: sqlitePasswords,
  oauth2IdentityLinks: sqliteOAuth2IdentityLinks,
  webauthnCredentials: sqliteWebauthnCredentials,
}
