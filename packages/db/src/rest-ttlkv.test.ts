import { describe, expect, it, vi } from 'vitest'
import { createRestDb } from './postgrest.js'
import { REST_TTLKV_TABLE, createRestTtlKv } from './rest-ttlkv.js'

interface Call {
  url: string
  init: RequestInit
}

function stubFetch(body = '[]', status = 200) {
  const calls: Call[] = []
  const impl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} })
    return new Response(body, { status, headers: { 'content-type': 'application/json' } })
  })
  return { calls, fetchImpl: impl as unknown as typeof fetch }
}

const dbOf = (fetchImpl: typeof fetch) =>
  createRestDb({ url: 'https://sb.example', apiKey: 'k', fetchImpl })

describe('createRestTtlKv — 与 SQL 版语义对齐', () => {
  it('set：upsert 到 key（on_conflict + merge-duplicates）', async () => {
    const { calls, fetchImpl } = stubFetch('[{"key":"k"}]')
    const kv = createRestTtlKv(dbOf(fetchImpl), { sweepProbability: 0 })
    await kv.set('k', 'v', 60_000)
    const c = calls[0]!
    expect(c.url).toBe(`https://sb.example/rest/v1/${REST_TTLKV_TABLE}?on_conflict=key`)
    expect(c.init.method).toBe('POST')
    expect((c.init.headers as Record<string, string>)['prefer']).toContain(
      'resolution=merge-duplicates',
    )
    const body = JSON.parse(String(c.init.body)) as {
      key: string
      value: string
      expires_at: number
    }
    expect(body.key).toBe('k')
    expect(body.value).toBe('v')
    expect(body.expires_at).toBeGreaterThan(Math.floor(Date.now() / 1000))
  })

  it('take：DELETE + 未过期过滤，命中返回 value', async () => {
    const { calls, fetchImpl } = stubFetch('[{"key":"k","value":"v","expires_at":9999999999}]')
    const kv = createRestTtlKv(dbOf(fetchImpl), { sweepProbability: 0 })
    await expect(kv.take('k')).resolves.toBe('v')
    const c = calls[0]!
    expect(c.init.method).toBe('DELETE')
    expect(c.url).toContain('key=eq.k')
    expect(c.url).toContain('expires_at=gt.')
    expect((c.init.headers as Record<string, string>)['prefer']).toBe('return=representation')
  })

  it('take 未命中（已过期或不存在）→ null', async () => {
    const { fetchImpl } = stubFetch('[]')
    const kv = createRestTtlKv(dbOf(fetchImpl), { sweepProbability: 0 })
    await expect(kv.take('gone')).resolves.toBeNull()
  })

  it('一次性消费：第二次 take 拿不到（DELETE 已删行）', async () => {
    const { fetchImpl } = stubFetch()
    const impl = fetchImpl as unknown as ReturnType<typeof vi.fn>
    impl
      .mockResolvedValueOnce(new Response('[{"value":"v"}]', { status: 200 }))
      .mockResolvedValueOnce(new Response('[]', { status: 200 }))
    const kv = createRestTtlKv(dbOf(fetchImpl), { sweepProbability: 0 })
    expect(await kv.take('k')).toBe('v')
    expect(await kv.take('k')).toBeNull()
  })

  it('sweepProbability=1 时先清扫过期项再写入', async () => {
    const { calls, fetchImpl } = stubFetch('[]')
    const kv = createRestTtlKv(dbOf(fetchImpl), { sweepProbability: 1 })
    await kv.set('k', 'v', 1000)
    expect(calls).toHaveLength(2)
    expect(calls[0]!.init.method).toBe('DELETE')
    expect(calls[0]!.url).toContain('expires_at=lte.')
    expect(calls[1]!.init.method).toBe('POST')
  })

  it('自定义表名', async () => {
    const { calls, fetchImpl } = stubFetch('[]')
    const kv = createRestTtlKv(dbOf(fetchImpl), { table: 'app_kv', sweepProbability: 0 })
    await kv.set('k', 'v', 1000)
    expect(calls[0]!.url).toContain('/rest/v1/app_kv')
  })
})
