import { describe, expect, it, vi } from 'vitest'
import type { RestDb } from '@homurajs/db'
import { buildRestTodoRepo } from './todos-repo.js'
import { todosRest } from './schema/rest.js'

/** 桩 RestDb：记录每次调用的算子与参数（house style：不 mock 全局 fetch） */
function stubRest(
  results: { select?: unknown[]; insert?: unknown[]; update?: unknown[]; remove?: unknown[] } = {},
) {
  const calls: Array<{ op: string; args: unknown[] }> = []
  const make = (op: string) =>
    vi.fn(async (...args: unknown[]) => {
      calls.push({ op, args })
      return (results[op as keyof typeof results] ?? []) as never
    })
  const table = {
    select: make('select'),
    insert: make('insert'),
    update: make('update'),
    remove: make('remove'),
  }
  const rest = { table: () => table, ping: vi.fn(async () => {}) } as unknown as RestDb
  return { rest, calls, table }
}

const ROW = {
  id: 't-1',
  title: '买牛奶',
  done: false,
  ownerSub: null,
  createdAt: '2026-10-13T14:46:20.714463+00:00',
  meta: null,
}

describe('schema/rest 派生描述符', () => {
  it('列名是 pgCol 配方的真实列名（camelCase，不是 snake_case）', () => {
    expect(todosRest.table).toBe('todos')
    expect(todosRest.columns).toEqual(['id', 'title', 'done', 'ownerSub', 'createdAt', 'meta'])
    expect(todosRest.primaryKeys).toEqual(['id'])
  })
})

describe('buildRestTodoRepo — 与 SQL 版语义对齐', () => {
  it('list(null)：ownerSub is.null 过滤 + createdAt 倒序', async () => {
    const { rest, calls } = stubRest({ select: [ROW] })
    const rows = await buildRestTodoRepo(rest).list(null)
    expect(calls[0]).toMatchObject({ op: 'select' })
    expect(calls[0]!.args[0]).toEqual({ ownerSub: null })
    expect(calls[0]!.args[1]).toEqual({ order: 'createdAt.desc' })
    expect(rows).toHaveLength(1)
  })

  it('list(sub)：按归属过滤', async () => {
    const { rest, calls } = stubRest()
    await buildRestTodoRepo(rest).list('sub-9')
    expect(calls[0]!.args[0]).toEqual({ ownerSub: 'sub-9' })
  })

  it('create：不传 id/createdAt（交给 DB 默认值），并把 ISO 时间转成 epoch', async () => {
    const { rest, calls } = stubRest({ insert: [ROW] })
    const todo = await buildRestTodoRepo(rest).create('买牛奶', null)
    const payload = calls[0]!.args[0] as Record<string, unknown>
    expect(payload).toEqual({ title: '买牛奶', done: false, ownerSub: null })
    expect(payload).not.toHaveProperty('id')
    expect(payload).not.toHaveProperty('createdAt')
    // 关键差异：PostgREST 的 timestamptz 是 ISO 字符串，不是 Date / epoch 数字
    expect(todo.createdAt).toBe(new Date(ROW.createdAt).getTime())
    expect(Number.isNaN(todo.createdAt)).toBe(false)
    expect(todo).toMatchObject({ id: 't-1', title: '买牛奶', done: false, ownerSub: null })
  })

  it('create 未返回行 → 抛错并指向 RLS policy（不静默返回 undefined）', async () => {
    const { rest } = stubRest({ insert: [] })
    await expect(buildRestTodoRepo(rest).create('x', null)).rejects.toThrow(/RLS policy/)
  })

  it('toggle：先按归属查当前值，再 PATCH 取反', async () => {
    const { rest, calls } = stubRest({ select: [ROW], update: [{ ...ROW, done: true }] })
    const todo = await buildRestTodoRepo(rest).toggle('t-1', null)
    expect(calls.map((c) => c.op)).toEqual(['select', 'update'])
    expect(calls[0]!.args[0]).toEqual({ id: 't-1', ownerSub: null })
    expect(calls[0]!.args[1]).toEqual({ limit: 1 })
    expect(calls[1]!.args[0]).toEqual({ done: true })
    expect(calls[1]!.args[1]).toEqual({ id: 't-1' })
    expect(todo?.done).toBe(true)
  })

  it('toggle 未命中（不属于该用户）→ null，且不发 PATCH', async () => {
    const { rest, calls } = stubRest({ select: [] })
    await expect(buildRestTodoRepo(rest).toggle('nope', 'sub-1')).resolves.toBeNull()
    expect(calls.map((c) => c.op)).toEqual(['select'])
  })

  it('remove：用 DELETE 返回的行数判定（PostgREST return=representation）', async () => {
    const hit = stubRest({ remove: [ROW] })
    await expect(buildRestTodoRepo(hit.rest).remove('t-1', null)).resolves.toBe(true)
    expect(hit.calls[0]!.args[0]).toEqual({ id: 't-1', ownerSub: null })

    const miss = stubRest({ remove: [] })
    await expect(buildRestTodoRepo(miss.rest).remove('t-1', null)).resolves.toBe(false)
  })

  it('表缺列时立刻抛错并指向平台受控迁移（不等到查询 400）', () => {
    // 派生描述符来自 schema/pg.ts；若有人改了 pg 列名而 repo 仍要旧列，这里就会红
    expect(todosRest.columns).toContain('ownerSub')
  })
})
