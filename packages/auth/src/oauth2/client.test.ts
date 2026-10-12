import { describe, expect, it, vi } from 'vitest'
import { createMemoryTtlKv } from '@homura/core'
import { OAuth2Client } from './client.js'
import type { OAuth2ClientConfig } from './client.js'
import type { AuthUser } from '../types.js'

const ENDPOINTS = {
  authorizeUrl: 'https://idp.example/authorize',
  tokenUrl: 'https://idp.example/token',
  userinfoUrl: 'https://idp.example/userinfo',
}

interface Captured {
  url: string
  method: string
  headers: Record<string, string>
  body?: string
}

/** 桩 IdP：token 端点回 access_token，userinfo 端点回标准 OIDC */
function stubIdp(overrides?: {
  tokenStatus?: number
  userinfoStatus?: number
  userinfoBody?: unknown
}) {
  const calls: Captured[] = []
  const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url)
    calls.push({
      url: u,
      method: init?.method ?? 'GET',
      headers: (init?.headers ?? {}) as Record<string, string>,
      body: init?.body ? String(init.body) : undefined,
    })
    if (u.includes('/token')) {
      return new Response(JSON.stringify({ access_token: 'at-123', token_type: 'bearer', expires_in: 3600 }), {
        status: overrides?.tokenStatus ?? 200,
        headers: { 'content-type': 'application/json' },
      })
    }
    if (u.includes('/userinfo')) {
      return new Response(JSON.stringify(overrides?.userinfoBody ?? { sub: 'user-1', name: '张三', picture: 'http://a' }), {
        status: overrides?.userinfoStatus ?? 200,
        headers: { 'content-type': 'application/json' },
      })
    }
    return new Response('', { status: 404 })
  })
  return { calls, fetchImpl: fetchImpl as unknown as typeof fetch }
}

const mapUser = (raw: unknown): AuthUser => {
  const u = raw as { sub?: string; name?: string; picture?: string }
  if (!u?.sub) throw new Error('missing sub')
  return { sub: u.sub, nickname: u.name, avatarUrl: u.picture || undefined }
}

function makeConfig(kv: ReturnType<typeof createMemoryTtlKv>, fetchImpl: typeof fetch): OAuth2ClientConfig {
  return {
    clientId: 'cid',
    clientSecret: 'csec',
    redirectUri: 'https://app.example/auth/callback',
    scopes: ['openid'],
    endpoints: ENDPOINTS,
    mapUser,
    stateKv: kv,
    fetchImpl,
  }
}

describe('OAuth2Client.authorizeUrl', () => {
  it('生成含 state 的 authorize URL，state 入 kv', async () => {
    const kv = createMemoryTtlKv()
    const stub = stubIdp()
    const client = new OAuth2Client(makeConfig(kv, stub.fetchImpl))
    const url = await client.authorizeUrl('/dash')
    const parsed = new URL(url)
    expect(parsed.origin + parsed.pathname).toBe('https://idp.example/authorize')
    expect(parsed.searchParams.get('client_id')).toBe('cid')
    expect(parsed.searchParams.get('redirect_uri')).toBe('https://app.example/auth/callback')
    expect(parsed.searchParams.get('response_type')).toBe('code')
    expect(parsed.searchParams.get('scope')).toBe('openid')
    const state = parsed.searchParams.get('state')!
    expect(state).toMatch(/^[A-Za-z0-9_-]+$/)
    // returnTo 存在 state 关联的 kv（take 一次消费）
    expect(await kv.take(state)).toBe('/dash')
  })
})

describe('OAuth2Client.callback — 完整 code flow', () => {
  it('authorize → callback：state 校验 → code 换 token → userinfo → mapUser', async () => {
    const kv = createMemoryTtlKv()
    const stub = stubIdp()
    const client = new OAuth2Client(makeConfig(kv, stub.fetchImpl))

    const url = await client.authorizeUrl('/home')
    const state = new URL(url).searchParams.get('state')!

    const result = await client.callback({ code: 'auth-code', state })
    expect(result.user).toEqual({ sub: 'user-1', nickname: '张三', avatarUrl: 'http://a' })
    expect(result.returnTo).toBe('/home')

    // token 端点：form 编码 + grant_type/code/client_id/client_secret/redirect_uri
    const tokenCall = stub.calls.find((c) => c.url.includes('/token'))!
    expect(tokenCall.method).toBe('POST')
    expect(tokenCall.headers['content-type']).toBe('application/x-www-form-urlencoded')
    const form = new URLSearchParams(tokenCall.body)
    expect(form.get('grant_type')).toBe('authorization_code')
    expect(form.get('code')).toBe('auth-code')
    expect(form.get('client_id')).toBe('cid')
    expect(form.get('client_secret')).toBe('csec')
    expect(form.get('redirect_uri')).toBe('https://app.example/auth/callback')

    // userinfo：Bearer 头
    const uiCall = stub.calls.find((c) => c.url.includes('/userinfo'))!
    expect(uiCall.headers['authorization']).toBe('Bearer at-123')
  })

  it('state 一次性消费：重放同一 state 拒绝', async () => {
    const kv = createMemoryTtlKv()
    const client = new OAuth2Client(makeConfig(kv, stubIdp().fetchImpl))
    const url = await client.authorizeUrl()
    const state = new URL(url).searchParams.get('state')!
    await client.callback({ code: 'c', state })
    await expect(client.callback({ code: 'c', state })).rejects.toThrow(/state 无效或已过期/)
  })

  it('伪造 state 拒绝', async () => {
    const kv = createMemoryTtlKv()
    const client = new OAuth2Client(makeConfig(kv, stubIdp().fetchImpl))
    await expect(client.callback({ code: 'c', state: 'forged' })).rejects.toThrow(/state 无效/)
  })

  it('缺 state 默认拒绝；allowNoState 显式放行', async () => {
    const kv = createMemoryTtlKv()
    const strict = new OAuth2Client(makeConfig(kv, stubIdp().fetchImpl))
    await expect(strict.callback({ code: 'c' })).rejects.toThrow(/缺少 state/)

    const kv2 = createMemoryTtlKv()
    const loose = new OAuth2Client({ ...makeConfig(kv2, stubIdp().fetchImpl), allowNoState: true })
    const r = await loose.callback({ code: 'c' })
    expect(r.user.sub).toBe('user-1')
  })

  it('缺 code 抛错', async () => {
    const kv = createMemoryTtlKv()
    const client = new OAuth2Client(makeConfig(kv, stubIdp().fetchImpl))
    await expect(client.callback({ code: '' })).rejects.toThrow(/缺少 code/)
  })

  it('token 端点非 2xx → 抛错含 body', async () => {
    const kv = createMemoryTtlKv()
    const stub = stubIdp({ tokenStatus: 400 })
    const client = new OAuth2Client(makeConfig(kv, stub.fetchImpl))
    const url = await client.authorizeUrl()
    const state = new URL(url).searchParams.get('state')!
    await expect(client.callback({ code: 'c', state })).rejects.toThrow(/token 端点失败: 400/)
  })

  it('userinfo 非 2xx → 抛错', async () => {
    const kv = createMemoryTtlKv()
    const stub = stubIdp({ userinfoStatus: 401 })
    const client = new OAuth2Client(makeConfig(kv, stub.fetchImpl))
    const url = await client.authorizeUrl()
    const state = new URL(url).searchParams.get('state')!
    await expect(client.callback({ code: 'c', state })).rejects.toThrow(/userinfo 端点失败: 401/)
  })

  it('mapUser 抛错透传（userinfo 缺 sub）', async () => {
    const kv = createMemoryTtlKv()
    const stub = stubIdp({ userinfoBody: { name: 'no-sub' } })
    const client = new OAuth2Client(makeConfig(kv, stub.fetchImpl))
    const url = await client.authorizeUrl()
    const state = new URL(url).searchParams.get('state')!
    await expect(client.callback({ code: 'c', state })).rejects.toThrow(/missing sub/)
  })

  it('authorizeExtraParams 透传', async () => {
    const kv = createMemoryTtlKv()
    const client = new OAuth2Client({
      ...makeConfig(kv, stubIdp().fetchImpl),
      authorizeExtraParams: { prompt: 'consent' },
    })
    const url = await client.authorizeUrl()
    expect(new URL(url).searchParams.get('prompt')).toBe('consent')
  })
})
