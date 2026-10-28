/**
 * schema 选择器 + todos repository（隔离方言差异）。
 * routes 只依赖 TodoRepo 接口，不感知 sqlite/pg。
 *
 * drizzle 的 query builder：`Database` 是 PgDatabase | SqliteDatabase 联合，
 * `db.select().from(table)` 无法静态匹配「db 方言 × table 方言」的 4 种组合（2 种非法），
 * 故收敛为 @homurajs/db 导出的 DrizzleQueryable 最小接口，只在此处转型一次
 * （新写 repo 直接复用它，别再复制一份接口定义）。
 */
import { and, desc, eq, isNull } from 'drizzle-orm'
import { type Database, type DrizzleQueryable } from '@homurajs/db'
import { pgSchema } from './schema/pg.js'
import { sqliteSchema } from './schema/sqlite.js'
import type { Todo } from '../shared/types.js'

export interface TodoRepo {
  list(ownerSub: string | null): Promise<Todo[]>
  create(title: string, ownerSub: string | null): Promise<Todo>
  toggle(id: string, ownerSub: string | null): Promise<Todo | null>
  remove(id: string, ownerSub: string | null): Promise<boolean>
}

/** drizzle 双方言共用的 query builder 子集（定义在 @homurajs/db，各 repo 共用） */
type Queryable = DrizzleQueryable

type TodosTable = typeof pgSchema.todos | typeof sqliteSchema.todos

interface TodoRow {
  id: string
  title: string
  done: boolean
  ownerSub: string | null
  createdAt: Date | number
}

function toTodo(row: TodoRow): Todo {
  return {
    id: row.id,
    title: row.title,
    done: row.done,
    ownerSub: row.ownerSub,
    createdAt: row.createdAt instanceof Date ? row.createdAt.getTime() : Number(row.createdAt),
  }
}

export function buildTodoRepo(db: Database, dialect: 'sqlite' | 'pg'): TodoRepo {
  const q = db as unknown as Queryable
  const todos = (dialect === 'pg' ? pgSchema.todos : sqliteSchema.todos) as TodosTable

  // 归属过滤：登录用户看自己的，匿名看无主的（ownerSub IS NULL）
  const ownerFilter = (ownerSub: string | null) =>
    ownerSub === null ? isNull(todos.ownerSub) : eq(todos.ownerSub, ownerSub)

  return {
    async list(ownerSub) {
      const rows = await q
        .select()
        .from(todos)
        .where(ownerFilter(ownerSub))
        .orderBy(desc(todos.createdAt))
      return rows.map((r) => toTodo(r as TodoRow))
    },

    async create(title, ownerSub) {
      const rows = await q
        .insert(todos)
        .values({ title, done: false, ownerSub, createdAt: new Date() })
        .returning()
      return toTodo(rows[0] as TodoRow)
    },

    async toggle(id, ownerSub) {
      const current = await q
        .select()
        .from(todos)
        .where(and(eq(todos.id, id), ownerFilter(ownerSub)))
      const row = current[0] as { done: boolean } | undefined
      if (!row) return null
      const updated = await q
        .update(todos)
        .set({ done: !row.done })
        .where(eq(todos.id, id))
        .returning()
      return toTodo(updated[0] as TodoRow)
    },

    async remove(id, ownerSub) {
      const deleted = await q
        .delete(todos)
        .where(and(eq(todos.id, id), ownerFilter(ownerSub)))
        .returning()
      return deleted.length > 0
    },
  }
}
