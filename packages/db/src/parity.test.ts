import { describe, expect, it } from 'vitest'
import { integer, pgTable, text, uuid } from 'drizzle-orm/pg-core'
import { integer as sInt, sqliteTable, text as sText } from 'drizzle-orm/sqlite-core'
import { assertSchemaParity } from './parity.js'

const pgTodos = pgTable('todos', {
  id: uuid().primaryKey(),
  title: text().notNull(),
  doneAt: text(),
  weight: integer(),
})
const sqliteTodos = sqliteTable('todos', {
  id: sText().primaryKey(),
  title: sText().notNull(),
  doneAt: sText(),
  weight: sInt(),
})

describe('assertSchemaParity', () => {
  it('双侧一致 → 通过', () => {
    expect(() =>
      assertSchemaParity({ todos: pgTodos }, { todos: sqliteTodos }),
    ).not.toThrow()
  })

  it('表集合不一致 → 抛错', () => {
    expect(() => assertSchemaParity({ todos: pgTodos, extra: pgTodos }, { todos: sqliteTodos })).toThrow(
      /仅 pg 侧有 \[extra\]/,
    )
  })

  it('列差异 → 抛错', () => {
    const sqliteMissing = sqliteTable('todos', {
      id: sText().primaryKey(),
      title: sText().notNull(),
    })
    expect(() => assertSchemaParity({ todos: pgTodos }, { todos: sqliteMissing })).toThrow(
      /仅pg有列/,
    )
  })

  it('主键差异 → 抛错', () => {
    const sqliteOtherPk = sqliteTable('todos', {
      id: sText(),
      title: sText().primaryKey(),
      doneAt: sText(),
      weight: sInt(),
    })
    expect(() => assertSchemaParity({ todos: pgTodos }, { todos: sqliteOtherPk })).toThrow(
      /主键不一致/,
    )
  })

  it('表名不一致（key 相同但 name 不同）→ 抛错', () => {
    const sqliteOtherName = sqliteTable('todoz', {
      id: sText().primaryKey(),
      title: sText().notNull(),
      doneAt: sText(),
      weight: sInt(),
    })
    expect(() => assertSchemaParity({ todos: pgTodos }, { todos: sqliteOtherName })).toThrow(
      /表名不一致/,
    )
  })
})
