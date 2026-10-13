import { describe, expect, it } from 'vitest'
import { boolean } from 'drizzle-orm/pg-core'
import { pgCol, pgTable, pgJson } from './schema-helpers.js'
import { assertRestColumns, restSchemaFromPg, restTableFromPg } from './rest-schema.js'

/** 复刻模板 todos 表的写法（pgCol 配方 + 一个显式命名列 + jsonb） */
const todos = pgTable('todos', {
  id: pgCol.id(),
  title: pgCol.text().notNull(),
  done: boolean('done').notNull().default(false),
  ownerSub: pgCol.text(),
  createdAt: pgCol.createdAt(),
  meta: pgJson<Record<string, unknown>>(),
})

describe('restTableFromPg — 从 pg schema 派生，不手写第三份', () => {
  it('表名与真实列名（含 pgCol 配方的 camelCase 列）', () => {
    const desc = restTableFromPg(todos)
    expect(desc.table).toBe('todos')
    // 关键：ownerSub/createdAt 是 camelCase（配方未传 name → 用 JS 属性名做列名）
    expect(desc.columns).toEqual(['id', 'title', 'done', 'ownerSub', 'createdAt', 'meta'])
    expect(desc.primaryKeys).toEqual(['id'])
  })

  it('显式命名的列（auth/license 那类 snake_case 表）同样正确', () => {
    const t = pgTable('refresh_tokens', {
      id: pgCol.text('token_hash'),
      familyId: pgCol.text('family_id'),
    })
    expect(restTableFromPg(t).columns).toEqual(['token_hash', 'family_id'])
  })

  it('非 pg 表（如 sqlite 表）抛错而非静默返回空描述符', () => {
    expect(() => restTableFromPg({})).toThrow(/pg-core/)
  })
})

describe('restSchemaFromPg', () => {
  it('键名与 pg schema 一致', () => {
    const derived = restSchemaFromPg({ todos })
    expect(Object.keys(derived)).toEqual(['todos'])
    expect(derived['todos']?.table).toBe('todos')
  })
})

describe('assertRestColumns', () => {
  it('列齐 → 不抛', () => {
    expect(() =>
      assertRestColumns(restTableFromPg(todos), ['id', 'ownerSub', 'createdAt']),
    ).not.toThrow()
  })

  it('缺列 → 错误信息点名缺失列并指向平台受控迁移', () => {
    expect(() => assertRestColumns(restTableFromPg(todos), ['id', 'owner_sub'])).toThrow(
      /owner_sub/,
    )
    expect(() => assertRestColumns(restTableFromPg(todos), ['owner_sub'])).toThrow(/受控迁移/)
  })
})
