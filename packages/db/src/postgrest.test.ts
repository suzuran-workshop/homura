import { describe, expect, it, vi } from 'vitest'
import {
  RestError,
  buildFilterEntries,
  buildFilterQuery,
  createRestDb,
  loadPostgrestEnv,
} from './postgrest.js'

interface Call {
  url: string
  init: RequestInit
}

/** 桩 fetch：记录调用，返回固定响应（house style：不 mock 全局 fetch） */
function stubFetch(body = '[]', status = 200) {
  const calls: Call[] = []
  const impl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} })
    return new Response(body, { status, headers: { 'content-type': 'application/json' } })
  })
  return { calls, fetchImpl: impl as unknown as typeof fetch }
}

const OPTS = { url: 'https://sb.example/', apiKey: 'anon' }

describe('buildFilterEntries — 过滤条件编码', () => {
  it('标量 → eq；null → is.null；数组 → in.()', () => {
    expect(buildFilterEntries({ a: 1, b: 'x', c: null, d: [1, 2] })).toEqual([
      ['a', 'eq.1'],
      ['b', 'eq.x'],
      ['c', 'is.null'],
      ['d', 'in.(1,2)'],
    ])
  })

  it('显式算子（gt/lte/like）与 in 的括号形式（语法标点保持字面量）', () => {
    expect(buildFilterQuery({ expires_at: { op: 'gt', value: 100 } })).toBe('expires_at=gt.100')
    expect(buildFilterQuery({ k: { op: 'in', value: ['a', 'b'] } })).toBe('k=in.(a,b)')
    expect(buildFilterQuery({ title: { op: 'like', value: '%x%' } })).toBe('title=like.%25x%25')
  })

  it('不做二次编码（URLSearchParams 会把 in.(a,b) 变成 in.%28a%2Cb%29）', () => {
    expect(buildFilterQuery({ k: { op: 'in', value: ['a', 'b'] } })).not.toContain('%28')
    expect(buildFilterQuery({ a: 1, b: 2 })).toBe('a=eq.1&b=eq.2')
  })

  it('值里的特殊字符被编码（不破坏 query 结构）', () => {
    expect(buildFilterQuery({ owner: 'a&b=c' })).toBe('owner=eq.a%26b%3Dc')
  })
})

describe('createRestDb — REST 契约快照', () => {
  it('select：GET + select=* + 过滤 + order + limit', async () => {
    const { calls, fetchImpl } = stubFetch('[{"id":1}]')
    const db = createRestDb({ ...OPTS, fetchImpl })
    const rows = await db
      .table('todos')
      .select({ owner_sub: null }, { order: 'created_at.desc', limit: 5 })
    expect(rows).toEqual([{ id: 1 }])
    const c = calls[0]!
    expect(c.url).toBe(
      'https://sb.example/rest/v1/todos?owner_sub=is.null&select=*&order=created_at.desc&limit=5',
    )
    expect(c.init.method).toBe('GET')
    const h = c.init.headers as Record<string, string>
    expect(h['apikey']).toBe('anon')
    expect(h['authorization']).toBe('Bearer anon')
  })

  it('insert：POST + Prefer return=representation', async () => {
    const { calls, fetchImpl } = stubFetch('[{"id":2,"title":"a"}]', 201)
    const db = createRestDb({ ...OPTS, fetchImpl })
    const rows = await db.table('todos').insert({ title: 'a' })
    expect(rows).toEqual([{ id: 2, title: 'a' }])
    const c = calls[0]!
    expect(c.url).toBe('https://sb.example/rest/v1/todos')
    expect(c.init.method).toBe('POST')
    expect((c.init.headers as Record<string, string>)['prefer']).toBe('return=representation')
    expect(JSON.parse(String(c.init.body))).toEqual({ title: 'a' })
  })

  it('insert upsertOn：带 on_conflict 且 Prefer 追加 merge-duplicates', async () => {
    const { calls, fetchImpl } = stubFetch('[{"key":"k"}]')
    const db = createRestDb({ ...OPTS, fetchImpl })
    await db.table('kv').insert({ key: 'k', value: 'v' }, { upsertOn: 'key' })
    const c = calls[0]!
    expect(c.url).toBe('https://sb.example/rest/v1/kv?on_conflict=key')
    expect((c.init.headers as Record<string, string>)['prefer']).toBe(
      'return=representation,resolution=merge-duplicates',
    )
  })

  it('update：PATCH + 过滤进 query + return=representation', async () => {
    const { calls, fetchImpl } = stubFetch('[{"id":1,"done":true}]')
    const db = createRestDb({ ...OPTS, fetchImpl })
    const rows = await db.table('todos').update({ done: true }, { id: 1 })
    expect(rows[0]).toMatchObject({ done: true })
    const c = calls[0]!
    expect(c.init.method).toBe('PATCH')
    expect(c.url).toBe('https://sb.example/rest/v1/todos?id=eq.1')
    expect(JSON.parse(String(c.init.body))).toEqual({ done: true })
  })

  it('remove：DELETE + 过滤，返回被删行（供 length>0 判定）', async () => {
    const { calls, fetchImpl } = stubFetch('[{"id":1},{"id":2}]')
    const db = createRestDb({ ...OPTS, fetchImpl })
    const deleted = await db.table('todos').remove({ id: [1, 2] })
    expect(deleted).toHaveLength(2)
    expect(calls[0]!.init.method).toBe('DELETE')
    expect(calls[0]!.url).toBe('https://sb.example/rest/v1/todos?id=in.(1,2)')
  })

  it('ping：limit=1 探活', async () => {
    const { calls, fetchImpl } = stubFetch('[]')
    const db = createRestDb({ ...OPTS, fetchImpl })
    await expect(db.ping('todos')).resolves.toBeUndefined()
    expect(calls[0]!.url).toContain('limit=1')
  })

  it('schema 选项 → Accept-Profile / Content-Profile 头', async () => {
    const { calls, fetchImpl } = stubFetch('[]')
    const db = createRestDb({ ...OPTS, schema: 'tenant_x_schema', fetchImpl })
    await db.table('todos').select()
    const h = calls[0]!.init.headers as Record<string, string>
    expect(h['accept-profile']).toBe('tenant_x_schema')
    expect(h['content-profile']).toBe('tenant_x_schema')
  })

  it('空响应体视为空数组（不 JSON.parse 崩）', async () => {
    const { fetchImpl } = stubFetch('', 200)
    const db = createRestDb({ ...OPTS, fetchImpl })
    await expect(db.table('todos').select()).resolves.toEqual([])
  })
})

describe('RestError — 两类静默失败必须给出可行动指引', () => {
  it('401 + 42501（RLS 无 policy）→ hint 指向受控迁移建 policy', async () => {
    const { fetchImpl } = stubFetch(
      '{"code":"42501","message":"new row violates row-level security policy for table \\"t\\""}',
      401,
    )
    const db = createRestDb({ ...OPTS, fetchImpl })
    const err = await db
      .table('t')
      .insert({ a: 1 })
      .catch((e: unknown) => e)
    expect(err).toBeInstanceOf(RestError)
    const e = err as RestError
    expect(e.status).toBe(401)
    expect(e.code).toBe('42501')
    expect(e.hint).toMatch(/policy/)
    expect(e.message).toMatch(/RLS/)
  })

  it('409 + 23505（唯一键冲突）→ hint 指向 upsertOn', async () => {
    const { fetchImpl } = stubFetch(
      '{"code":"23505","message":"duplicate key value violates unique constraint"}',
      409,
    )
    const db = createRestDb({ ...OPTS, fetchImpl })
    const e = (await db
      .table('t')
      .insert({ uid: 'x' })
      .catch((x: unknown) => x)) as RestError
    expect(e.code).toBe('23505')
    expect(e.hint).toMatch(/upsertOn/)
  })

  it('404（表未建/未暴露）→ hint 指向平台受控迁移建表', async () => {
    const { fetchImpl } = stubFetch('{"message":"relation not found"}', 404)
    const db = createRestDb({ ...OPTS, fetchImpl })
    const e = (await db
      .table('nope')
      .select()
      .catch((x: unknown) => x)) as RestError
    expect(e.status).toBe(404)
    expect(e.hint).toMatch(/受控迁移/)
  })

  it('非 JSON 错误体（网关错误页）不崩，原文截断保留', async () => {
    const { fetchImpl } = stubFetch('<html>502 Bad Gateway</html>', 502)
    const db = createRestDb({ ...OPTS, fetchImpl })
    const e = (await db
      .table('t')
      .select()
      .catch((x: unknown) => x)) as RestError
    expect(e.status).toBe(502)
    expect(e.code).toBeNull()
    expect(e.message).toMatch(/502 Bad Gateway/)
  })
})

describe('loadPostgrestEnv', () => {
  it('qw-pages 实测注入集即可解析', () => {
    expect(
      loadPostgrestEnv({ SUPABASE_URL: 'https://sb.example/', SUPABASE_ANON_KEY: 'k' }),
    ).toEqual({
      url: 'https://sb.example',
      apiKey: 'k',
    })
  })

  it('缺项点名报错', () => {
    expect(() => loadPostgrestEnv({})).toThrow(/SUPABASE_URL/)
    expect(() => loadPostgrestEnv({ SUPABASE_URL: 'https://x' })).toThrow(/SUPABASE_ANON_KEY/)
  })
})
