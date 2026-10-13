import { describe, expect, it } from 'vitest'
import { sqliteTable, sqliteCol } from './schema-helpers.js'
import { createDb, createSqliteDb } from './index.js'
import { sql } from 'drizzle-orm'

describe('createDb（sqlite 路径）', () => {
  it(':memory: 建库 + 原生 SQL 往返', async () => {
    const db = createSqliteDb({ dialect: 'sqlite', path: ':memory:' })
    await db.run(sql`CREATE TABLE smoke (id TEXT PRIMARY KEY, name TEXT NOT NULL)`)
    await db.run(sql`INSERT INTO smoke (id, name) VALUES ('1', 'hello')`)
    const rows = await db.all<{ id: string; name: string }>(
      sql`SELECT id, name FROM smoke WHERE id = '1'`,
    )
    expect((rows as unknown as Array<{ name: string }>)[0]).toMatchObject({ name: 'hello' })
  })

  it('pg 未注册时抛出指引性错误', () => {
    expect(() => createDb({ dialect: 'pg', url: 'postgresql://x' })).toThrow(/@homurajs\/db\/pg/)
  })

  it('dispatch 到 sqlite 成功', () => {
    const db = createDb({ dialect: 'sqlite', path: ':memory:' })
    expect(db).toBeDefined()
  })

  it('schema-helpers 的 sqliteTable/配方 可用', () => {
    const t = sqliteTable('t', { id: sqliteCol.text().primaryKey() })
    expect(t).toBeDefined()
  })
})
