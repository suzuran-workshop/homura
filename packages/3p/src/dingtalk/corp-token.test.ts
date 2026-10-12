import { describe, expect, it, vi } from 'vitest'
import { CorpTokenManager } from './corp-token.js'

/** 桩：按序返回 token，记录调用次数与 URL */
function tokenServer(tokens: Array<{ access_token?: string; errcode?: number; errmsg?: string; expires_in?: number }>) {
  const calls: string[] = []
  let i = 0
  const fetchImpl = vi.fn(async (url: string | URL | Request) => {
    calls.push(String(url))
    const t = tokens[Math.min(i, tokens.length - 1)]!
    i++
    return new Response(JSON.stringify({ expires_in: 7200, ...t }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  })
  return { calls, fetchImpl: fetchImpl as unknown as typeof fetch }
}

describe('CorpTokenManager', () => {
  it('gettoken 端点与参数正确（appkey/appsecret 编码）', async () => {
    const s = tokenServer([{ access_token: 'tok1' }])
    const m = new CorpTokenManager({
      appKey: 'key&x',
      appSecret: 'se c',
      fetchImpl: s.fetchImpl,
    })
    await m.getAccessToken()
    expect(s.calls[0]).toContain('https://oapi.dingtalk.com/gettoken?')
    expect(s.calls[0]).toContain('appkey=key%26x')
    expect(s.calls[0]).toContain('appsecret=se%20c')
  })

  it('TTL 内多次调用只请求一次（缓存）', async () => {
    const s = tokenServer([{ access_token: 'tok1' }])
    let now = 1_000_000
    const m = new CorpTokenManager({ appKey: 'k', appSecret: 's', fetchImpl: s.fetchImpl, now: () => now })
    const a = await m.getAccessToken()
    const b = await m.getAccessToken()
    expect(a).toBe('tok1')
    expect(b).toBe('tok1')
    expect(s.calls).toHaveLength(1)
  })

  it('临近过期（提前 5min）自动刷新', async () => {
    const s = tokenServer([{ access_token: 'tok1' }, { access_token: 'tok2' }])
    let now = 0
    const m = new CorpTokenManager({ appKey: 'k', appSecret: 's', fetchImpl: s.fetchImpl, now: () => now })
    await m.getAccessToken() // tok1，expires_at = 7200s
    now = 7200_000 - 200_000 // 距过期 < 300s
    expect(await m.getAccessToken()).toBe('tok2')
    expect(s.calls).toHaveLength(2)
  })

  it('并发 single-flight：同时刻多次调用只发一次请求', async () => {
    let resolveToken: ((v: Response) => void) | null = null
    const fetchImpl = vi.fn(
      () => new Promise<Response>((res) => { resolveToken = res }),
    ) as unknown as typeof fetch
    const m = new CorpTokenManager({ appKey: 'k', appSecret: 's', fetchImpl })

    const p = Promise.all([m.getAccessToken(), m.getAccessToken(), m.getAccessToken()])
    resolveToken!(
      new Response(JSON.stringify({ access_token: 'shared', expires_in: 7200 }), { status: 200 }),
    )
    const results = await p
    expect(results).toEqual(['shared', 'shared', 'shared'])
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('invalidate() 后强制刷新', async () => {
    const s = tokenServer([{ access_token: 'tok1' }, { access_token: 'tok2' }])
    const m = new CorpTokenManager({ appKey: 'k', appSecret: 's', fetchImpl: s.fetchImpl })
    expect(await m.getAccessToken()).toBe('tok1')
    m.invalidate()
    expect(await m.getAccessToken()).toBe('tok2')
    expect(s.calls).toHaveLength(2)
  })

  it('errcode 非 0 → 抛错（含 errmsg）', async () => {
    const s = tokenServer([{ errcode: 40089, errmsg: 'invalid appsecret' }])
    const m = new CorpTokenManager({ appKey: 'k', appSecret: 's', fetchImpl: s.fetchImpl })
    await expect(m.getAccessToken()).rejects.toThrow(/40089.*invalid appsecret/)
  })

  it('刷新失败但旧 token 仍在劫期内 → 返回旧 token（韧性）', async () => {
    const responses: Array<() => Response> = [
      () => new Response(JSON.stringify({ access_token: 'tok1', expires_in: 7200 }), { status: 200 }),
      () => new Response(JSON.stringify({ errcode: 500, errmsg: 'boom' }), { status: 200 }),
    ]
    let i = 0
    let now = 0
    const fetchImpl = vi.fn(async () => responses[Math.min(i++, responses.length - 1)]!()) as unknown as typeof fetch
    const m = new CorpTokenManager({ appKey: 'k', appSecret: 's', fetchImpl, now: () => now })
    await m.getAccessToken() // tok1
    now = 7200_000 - 200_000 // 触发提前刷新，但刷新失败
    // 旧 token 仍在 expiresAt 内 → 韧性返回
    expect(await m.getAccessToken()).toBe('tok1')
  })
})
