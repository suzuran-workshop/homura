import { describe, expect, it, vi } from 'vitest'
import { SignJWT } from 'jose'
import { createMemoryTtlKv } from '@homurajs/core'
import { OidcClient, OidcError } from './client.js'
import type { OidcClientConfig } from './client.js'
import type { AuthUser } from '../types.js'

const CLIENT_SECRET = 'csec-test-secret'
const ISSUER = 'https://idp.example/my_org'

const ENDPOINTS = {
  authorizeUrl: 'https://idp.example/my_org/authorize',
  tokenUrl: 'https://idp.example/my_org/token',
  userinfoUrl: 'https://idp.example/my_org/userinfo',
}

interface Captured {
  url: string
  method: string
  headers: Record<string, string>
  body?: string
}

/** HS256 签发 id_token（模拟 oidc-dingtalk 的 token 端点行为） */
async function signIdToken(claims: {
  sub: string
  name?: string
  picture?: string
  iss?: string
  aud?: string | string[]
  expOffsetSec?: number
  alg?: 'HS256'
  secret?: string
}): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  const key = new TextEncoder().encode(claims.secret ?? CLIENT_SECRET)
  const jwt = new SignJWT({ name: claims.name, picture: claims.picture })
    .setProtectedHeader({ alg: claims.alg ?? 'HS256', typ: 'JWT' })
    .setIssuer(claims.iss ?? ISSUER)
    .setSubject(claims.sub)
    .setAudience(claims.aud ?? 'cid')
    .setIssuedAt(now)
    .setExpirationTime(now + (claims.expOffsetSec ?? 3600))
  return jwt.sign(key)
}

/** 桩 IdP：token 端点回 access_token + id_token，userinfo 端点回标准 OIDC */
function stubIdp(overrides?: {
  tokenStatus?: number
  tokenBody?: unknown
  userinfoStatus?: number
  userinfoBody?: unknown
  idToken?: string | null
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
      if (overrides?.tokenBody !== undefined) {
        return new Response(JSON.stringify(overrides.tokenBody), { status: overrides.tokenStatus ?? 200 })
      }
      const base = { access_token: 'at-123', token_type: 'bearer', expires_in: 3600 }
      const idToken = overrides?.idToken === null ? null : (overrides?.idToken ?? (await signIdToken({ sub: 'user-1', name: '张三' })))
      return new Response(
        JSON.stringify(idToken ? { ...base, id_token: idToken } : base),
        { status: overrides?.tokenStatus ?? 200, headers: { 'content-type': 'application/json' } },
      )
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

function makeConfig(kv: ReturnType<typeof createMemoryTtlKv>, fetchImpl: typeof fetch): OidcClientConfig {
  return {
    clientId: 'cid',
    clientSecret: CLIENT_SECRET,
    redirectUri: 'https://app.example/auth/oidc/callback',
    scopes: ['openid'],
    issuer: ISSUER,
    endpoints: ENDPOINTS,
    mapUser,
    stateKv: kv,
    fetchImpl,
  }
}

describe('OidcClient.authorizeUrl', () => {
  it('生成含 state 的 authorize URL，state 入 kv；scope 缺省 openid', async () => {
    const kv = createMemoryTtlKv()
    const stub = stubIdp()
    const client = new OidcClient(makeConfig(kv, stub.fetchImpl))
    const url = await client.authorizeUrl('/dash')
    const parsed = new URL(url)
    expect(parsed.origin + parsed.pathname).toBe('https://idp.example/my_org/authorize')
    expect(parsed.searchParams.get('client_id')).toBe('cid')
    expect(parsed.searchParams.get('redirect_uri')).toBe('https://app.example/auth/oidc/callback')
    expect(parsed.searchParams.get('response_type')).toBe('code')
    expect(parsed.searchParams.get('scope')).toBe('openid')
    const state = parsed.searchParams.get('state')!
    expect(state).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(await kv.take(state)).toBe('/dash')
  })
})

describe('OidcClient.callback — 完整 OIDC code flow', () => {
  it('state 校验 → token → id_token 验签 → userinfo → sub 交叉核对 → mapUser', async () => {
    const kv = createMemoryTtlKv()
    const stub = stubIdp()
    const client = new OidcClient(makeConfig(kv, stub.fetchImpl))

    const url = await client.authorizeUrl('/home')
    const state = new URL(url).searchParams.get('state')!

    const result = await client.callback({ code: 'auth-code', state })
    expect(result.user).toEqual({ sub: 'user-1', nickname: '张三', avatarUrl: 'http://a' })
    expect(result.returnTo).toBe('/home')
    // 验签后的 claims 可用
    expect(result.claims.iss).toBe(ISSUER)
    expect(result.claims.sub).toBe('user-1')

    // token 端点：form 编码 + 标准五参数
    const tokenCall = stub.calls.find((c) => c.url.includes('/token'))!
    expect(tokenCall.method).toBe('POST')
    expect(tokenCall.headers['content-type']).toBe('application/x-www-form-urlencoded')
    const form = new URLSearchParams(tokenCall.body)
    expect(form.get('grant_type')).toBe('authorization_code')
    expect(form.get('code')).toBe('auth-code')
    expect(form.get('client_id')).toBe('cid')
    expect(form.get('client_secret')).toBe(CLIENT_SECRET)
    expect(form.get('redirect_uri')).toBe('https://app.example/auth/oidc/callback')

    // userinfo：Bearer 头
    const uiCall = stub.calls.find((c) => c.url.includes('/userinfo'))!
    expect(uiCall.headers['authorization']).toBe('Bearer at-123')
  })

  it('state 一次性消费：重放同一 state 拒绝', async () => {
    const kv = createMemoryTtlKv()
    const client = new OidcClient(makeConfig(kv, stubIdp().fetchImpl))
    const url = await client.authorizeUrl()
    const state = new URL(url).searchParams.get('state')!
    await client.callback({ code: 'c', state })
    await expect(client.callback({ code: 'c', state })).rejects.toThrow(/state 无效或已过期/)
  })

  it('伪造 state 拒绝（OidcError invalid_state）', async () => {
    const kv = createMemoryTtlKv()
    const client = new OidcClient(makeConfig(kv, stubIdp().fetchImpl))
    const err = await client.callback({ code: 'c', state: 'forged' }).catch((e) => e)
    expect(err).toBeInstanceOf(OidcError)
    expect((err as OidcError).code).toBe('invalid_state')
  })

  it('缺 state 默认拒绝；allowNoState 显式放行', async () => {
    const kv = createMemoryTtlKv()
    const strict = new OidcClient(makeConfig(kv, stubIdp().fetchImpl))
    await expect(strict.callback({ code: 'c' })).rejects.toThrow(/缺少 state/)

    const kv2 = createMemoryTtlKv()
    const loose = new OidcClient({ ...makeConfig(kv2, stubIdp().fetchImpl), allowNoState: true })
    const r = await loose.callback({ code: 'c' })
    expect(r.user.sub).toBe('user-1')
  })

  it('缺 code 抛错', async () => {
    const kv = createMemoryTtlKv()
    const client = new OidcClient(makeConfig(kv, stubIdp().fetchImpl))
    await expect(client.callback({ code: '' })).rejects.toThrow(/缺少 code/)
  })

  it('token 端点非 2xx → OidcError token_failed 含 body', async () => {
    const kv = createMemoryTtlKv()
    const stub = stubIdp({ tokenStatus: 400 })
    const client = new OidcClient(makeConfig(kv, stub.fetchImpl))
    const url = await client.authorizeUrl()
    const state = new URL(url).searchParams.get('state')!
    const err = await client.callback({ code: 'c', state }).catch((e) => e)
    expect(err).toBeInstanceOf(OidcError)
    expect((err as OidcError).code).toBe('token_failed')
  })

  it('token 响应缺 id_token → OidcError missing_id_token（IdP 非 OIDC）', async () => {
    const kv = createMemoryTtlKv()
    const stub = stubIdp({ idToken: null })
    const client = new OidcClient(makeConfig(kv, stub.fetchImpl))
    const url = await client.authorizeUrl()
    const state = new URL(url).searchParams.get('state')!
    const err = await client.callback({ code: 'c', state }).catch((e) => e)
    expect(err).toBeInstanceOf(OidcError)
    expect((err as OidcError).code).toBe('missing_id_token')
  })

  it('id_token 篡改（密钥不对）→ OidcError id_token_invalid', async () => {
    const kv = createMemoryTtlKv()
    const forged = await signIdToken({ sub: 'user-1', secret: 'attacker-secret' })
    const stub = stubIdp({ idToken: forged })
    const client = new OidcClient(makeConfig(kv, stub.fetchImpl))
    const url = await client.authorizeUrl()
    const state = new URL(url).searchParams.get('state')!
    const err = await client.callback({ code: 'c', state }).catch((e) => e)
    expect(err).toBeInstanceOf(OidcError)
    expect((err as OidcError).code).toBe('id_token_invalid')
  })

  it('id_token iss 不符 → 拒绝', async () => {
    const kv = createMemoryTtlKv()
    const wrongIss = await signIdToken({ sub: 'user-1', iss: 'https://evil.example' })
    const stub = stubIdp({ idToken: wrongIss })
    const client = new OidcClient(makeConfig(kv, stub.fetchImpl))
    const url = await client.authorizeUrl()
    const state = new URL(url).searchParams.get('state')!
    await expect(client.callback({ code: 'c', state })).rejects.toThrow(/id_token 验签失败/)
  })

  it('id_token aud 不符 → 拒绝（防 token 混用）', async () => {
    const kv = createMemoryTtlKv()
    const wrongAud = await signIdToken({ sub: 'user-1', aud: 'other-client' })
    const stub = stubIdp({ idToken: wrongAud })
    const client = new OidcClient(makeConfig(kv, stub.fetchImpl))
    const url = await client.authorizeUrl()
    const state = new URL(url).searchParams.get('state')!
    const err = await client.callback({ code: 'c', state }).catch((e) => e)
    expect((err as OidcError).code).toBe('id_token_invalid')
  })

  it('id_token 过期（超出 leeway）→ 拒绝', async () => {
    const kv = createMemoryTtlKv()
    const now = Math.floor(Date.now() / 1000)
    const expired = await new SignJWT({ name: 'x' })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setIssuer(ISSUER)
      .setSubject('user-1')
      .setAudience('cid')
      .setIssuedAt(now - 7200)
      .setExpirationTime(now - 3600) // 过期 1h，远超 60s leeway
      .sign(new TextEncoder().encode(CLIENT_SECRET))
    const stub = stubIdp({ idToken: expired })
    const client = new OidcClient(makeConfig(kv, stub.fetchImpl))
    const url = await client.authorizeUrl()
    const state = new URL(url).searchParams.get('state')!
    const err = await client.callback({ code: 'c', state }).catch((e) => e)
    expect((err as OidcError).code).toBe('id_token_invalid')
  })

  it('userinfo.sub ≠ id_token.sub → OidcError sub_mismatch（身份绑定失败）', async () => {
    const kv = createMemoryTtlKv()
    const stub = stubIdp({ userinfoBody: { sub: 'someone-else', name: '李四' } })
    const client = new OidcClient(makeConfig(kv, stub.fetchImpl))
    const url = await client.authorizeUrl()
    const state = new URL(url).searchParams.get('state')!
    const err = await client.callback({ code: 'c', state }).catch((e) => e)
    expect(err).toBeInstanceOf(OidcError)
    expect((err as OidcError).code).toBe('sub_mismatch')
  })

  it('userinfo 非 2xx → OidcError userinfo_failed', async () => {
    const kv = createMemoryTtlKv()
    const stub = stubIdp({ userinfoStatus: 401 })
    const client = new OidcClient(makeConfig(kv, stub.fetchImpl))
    const url = await client.authorizeUrl()
    const state = new URL(url).searchParams.get('state')!
    const err = await client.callback({ code: 'c', state }).catch((e) => e)
    expect((err as OidcError).code).toBe('userinfo_failed')
  })

  it('mapUser 抛错 → OidcError map_failed 透传原因', async () => {
    const kv = createMemoryTtlKv()
    const stub = stubIdp({ userinfoBody: { name: 'no-sub' } })
    const client = new OidcClient(makeConfig(kv, stub.fetchImpl))
    const url = await client.authorizeUrl()
    const state = new URL(url).searchParams.get('state')!
    const err = await client.callback({ code: 'c', state }).catch((e) => e)
    expect((err as OidcError).code).toBe('map_failed')
  })

  it('authorizeExtraParams 透传', async () => {
    const kv = createMemoryTtlKv()
    const client = new OidcClient({
      ...makeConfig(kv, stubIdp().fetchImpl),
      authorizeExtraParams: { prompt: 'consent' },
    })
    const url = await client.authorizeUrl()
    expect(new URL(url).searchParams.get('prompt')).toBe('consent')
  })
})
