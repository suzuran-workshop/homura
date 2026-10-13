/**
 * schema 选择器 + todos repository（隔离方言差异）。
 * routes 只依赖 TodoRepo 接口，不感知 sqlite/pg/rest。
 *
 * 为什么有 Queryable 转型：drizzle 的 Database 是 PgDatabase | SqliteDatabase 联合，
 * db.select().from(table) 无法静态匹配「db 方言 × table 方言」的 4 种组合（2 种非法）。
 * 两 driver 的 query builder 方法签名一致，故收敛为一个最小接口，只在此处转型一次。
 *
 * REST 形态（qw-pages）走 buildRestTodoRepo：它不是 drizzle，没有 query builder，
 * 列名取自 schema/rest.ts 的派生描述符，时间戳是 ISO 字符串需自行转 epoch。
 */
import { and, desc, eq, isNull } from 'drizzle-orm'
import { assertRestColumns, type Database, type RestDb } from '@homurajs/db'
import { pgSchema } from './schema/pg.js'
import { sqliteSchema } from './schema/sqlite.js'
import { todosRest } from './schema/rest.js'
import type { Todo } from '../shared/types.js'

export interface TodoRepo {
  list(ownerSub: string | null): Promise<Todo[]>
  create(title: string, ownerSub: string | null): Promise<Todo>
  toggle(id: string, ownerSub: string | null): Promise<Todo | null>
  remove(id: string, ownerSub: string | null): Promise<boolean>
}

// drizzle 双方言共用的 query builder 子集（select/insert/update/delete + 链式）
/* eslint-disable @typescript-eslint/no-explicit-any */
interface SelectFrom {
  where(c: any): Promise<any[]> & { orderBy(c: any): Promise<any[]> }
}
interface Queryable {
  select(): { from(t: any): SelectFrom }
  insert(t: any): { values(v: any): { returning(): Promise<any[]> } }
  update(t: any): { set(v: any): { where(c: any): { returning(): Promise<any[]> } } }
  delete(t: any): { where(c: any): { returning(): Promise<any[]> } }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

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

/**
 * PostgREST 返回的行：键是 PG 真实列名（camelCase），timestamptz 是 ISO 字符串
 * （不是 Date，也不是 epoch 数字——这是与 SQL 形态最容易踩空的差异）。
 */
interface TodoRestRow {
  id: string
  title: string
  done: boolean
  ownerSub: string | null
  createdAt: string
  meta: unknown
  [column: string]: unknown
}

/**
 * REST 形态的 todos repository（qw-pages）。
 * 算子集与 SQL 版一一对应，且每一种请求形态都经线上实测：
 * eq 过滤 / is.null 过滤 / order desc / 指定列 / PATCH+return / DELETE+return。
 */
export function buildRestTodoRepo(rest: RestDb): TodoRepo {
  // 缺列立刻报错并指向平台受控迁移，不要等到查询返回 400 才暴露
  assertRestColumns(todosRest, ['id', 'title', 'done', 'ownerSub', 'createdAt'])
  const t = rest.table<TodoRestRow>(todosRest.table)

  // 归属过滤：登录用户看自己的，匿名看无主的（ownerSub IS NULL）
  const ownerFilter = (ownerSub: string | null): { ownerSub: string | null } => ({ ownerSub })

  const toTodo = (row: TodoRestRow): Todo => ({
    id: row.id,
    title: row.title,
    done: row.done,
    ownerSub: row.ownerSub,
    createdAt: new Date(row.createdAt).getTime(),
  })

  return {
    async list(ownerSub) {
      const rows = await t.select(ownerFilter(ownerSub), { order: 'createdAt.desc' })
      return rows.map(toTodo)
    },

    async create(title, ownerSub) {
      // createdAt 交给 DB 默认值（defaultNow）；id 交给 uuid defaultRandom
      const rows = await t.insert({ title, done: false, ownerSub })
      const row = rows[0]
      if (!row) {
        throw new Error('PostgREST insert 未返回行：检查该表 RLS policy 是否允许 anon INSERT')
      }
      return toTodo(row)
    },

    async toggle(id, ownerSub) {
      const current = await t.select({ id, ...ownerFilter(ownerSub) }, { limit: 1 })
      const row = current[0]
      if (!row) return null
      const updated = await t.update({ done: !row.done }, { id })
      const hit = updated[0]
      return hit ? toTodo(hit) : null
    },

    async remove(id, ownerSub) {
      const deleted = await t.remove({ id, ...ownerFilter(ownerSub) })
      return deleted.length > 0
    },
  }
}
