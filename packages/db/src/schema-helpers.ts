/**
 * 双方言 schema 配方：压掉 schema/pg.ts 与 schema/sqlite.ts 之间 80% 的重复。
 * 仅支持双方言共有特性子集；差异映射见 docs/specs/module-schema。
 *
 * 列名规则：不传 name 时 drizzle 用 JS 属性名做 DB 列名（camelCase）。
 * 需要 snake_case 列名（走原生 SQL 的表）请显式传入 name 参数。
 */
import { sql } from 'drizzle-orm'
import {
  bigint,
  integer,
  jsonb,
  pgTable,
  text as pgText,
  timestamp as pgTimestamp,
  uuid,
} from 'drizzle-orm/pg-core'
import { integer as sqliteInteger, sqliteTable, text as sqliteText } from 'drizzle-orm/sqlite-core'
import { randomUUID } from 'node:crypto'

export const pgCol = {
  id: (name?: string) => (name ? uuid(name) : uuid()).primaryKey().defaultRandom(),
  createdAt: (name?: string) =>
    (name ? pgTimestamp(name, { withTimezone: true }) : pgTimestamp({ withTimezone: true }))
      .notNull()
      .defaultNow(),
  updatedAt: (name?: string) =>
    (name ? pgTimestamp(name, { withTimezone: true }) : pgTimestamp({ withTimezone: true }))
      .notNull()
      .defaultNow(),
  text: (name?: string) => (name ? pgText(name) : pgText()),
  int: (name?: string) => (name ? integer(name) : integer()),
  /** epoch 毫秒（bigint number 模式）：原生 SQL 读写双方言一致（node:sqlite 不接受 Date 对象） */
  epochMs: (name?: string) => (name ? bigint(name, { mode: 'number' }) : bigint({ mode: 'number' })),
} as const

export const sqliteCol = {
  id: (name?: string) => (name ? sqliteText(name) : sqliteText()).primaryKey().$defaultFn(() => randomUUID()),
  createdAt: (name?: string) =>
    (name ? sqliteInteger(name, { mode: 'timestamp_ms' }) : sqliteInteger({ mode: 'timestamp_ms' }))
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  updatedAt: (name?: string) =>
    (name ? sqliteInteger(name, { mode: 'timestamp_ms' }) : sqliteInteger({ mode: 'timestamp_ms' }))
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  text: (name?: string) => (name ? sqliteText(name) : sqliteText()),
  int: (name?: string) => (name ? sqliteInteger(name) : sqliteInteger()),
  /** epoch 毫秒（sqlite integer 为 int64） */
  epochMs: (name?: string) => (name ? sqliteInteger(name) : sqliteInteger()),
} as const

/** jsonb ↔ text-json 统一 JSON 列 */
export const pgJson = <T>(name?: string) => (name ? jsonb(name) : jsonb()).$type<T>()
export const sqliteJson = <T>(name?: string) =>
  (name ? sqliteText(name, { mode: 'json' }) : sqliteText({ mode: 'json' })).$type<T>()

export { pgTable, sqliteTable }
