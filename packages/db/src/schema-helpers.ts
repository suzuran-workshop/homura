/**
 * 双方言 schema 配方：压掉 schema/pg.ts 与 schema/sqlite.ts 之间 80% 的重复。
 * 仅支持双方言共有特性子集；差异映射见 docs/specs/module-schema。
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
  id: () => uuid().primaryKey().defaultRandom(),
  createdAt: () => pgTimestamp({ withTimezone: true }).notNull().defaultNow(),
  updatedAt: () => pgTimestamp({ withTimezone: true }).notNull().defaultNow(),
  text: () => pgText(),
  int: () => integer(),
  /** epoch 毫秒（bigint number 模式）：原生 SQL 读写双方言一致（node:sqlite 不接受 Date 对象） */
  epochMs: () => bigint({ mode: 'number' }),
} as const

export const sqliteCol = {
  id: () => sqliteText().primaryKey().$defaultFn(() => randomUUID()),
  createdAt: () =>
    sqliteInteger({ mode: 'timestamp_ms' })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  updatedAt: () =>
    sqliteInteger({ mode: 'timestamp_ms' })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  text: () => sqliteText(),
  int: () => sqliteInteger(),
  /** epoch 毫秒（sqlite integer 为 int64） */
  epochMs: () => sqliteInteger(),
} as const

/** jsonb ↔ text-json 统一 JSON 列 */
export const pgJson = <T>() => jsonb().$type<T>()
export const sqliteJson = <T>() => sqliteText({ mode: 'json' }).$type<T>()

export { pgTable, sqliteTable }
