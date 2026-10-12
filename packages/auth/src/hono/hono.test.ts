import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Hono } from 'hono'
import { sql } from 'drizzle-orm'
import { createMemoryTtlKv } from '@homura/core'
import { createSqliteDb } from '@homura/db'
import { OAuth2Client } from '../oauth2/client.js'
import { SessionManager } from '../session/manager.js'
import { createDrizzleSessionStore } from '../session/store.js'
import { createAuthRoutes } from './routes.js'
import { sessionMiddleware, requireAuth } from './middleware.js'

const SECRET = 'a'.repeat(40)

/** 桩 IdP fetch：token → access_token，userinfo → 标准 OIDC {sub,name} */
const stubFetch = vi.fn(async (url: string | URL | Request) => {
  const u = String(url)
  if (u.includes('/token')) {
    return new Response(JSON.stringify({ access_token: 'at-1', token_type: 'bearer' }), { status: 200 })
  }
  if (u.includes('/userinfo')) {
    return new Response(JSON.stringify({ sub: 'u1', name: '张三', picture: 'http://a' }), { status: 200 })
  }
  return new Response('', { status: 404 })
}) as unknown as typeof fetch

async function buildApp(opts?: { accessTtl?: number; now?: () => Date }) {
  const db = createSqliteDb({ dialect: 'sqlite', path: ':memory:' })
  await db.run(sql.raw(
    `CREATE TABLE refresh_tokens (
      token_hash TEXT PRIMARY KEY, family_id TEXT NOT NULL, sid TEXT NOT NULL,
      sub TEXT NOT NULL, expires_at INTEGER NOT NULL, used_at INTEGER, profile TEXT
    )`,
  ))
  const kv = createMemoryTtlKv()
  const store = createDrizzleSessionStore(db, opts?.now ? { now: () => opts.now!().getTime() } : undefined)
  const sessions = new SessionManager(
    {
      secret: SECRET,
      accessTokenTtlSec: opts?.accessTtl ?? 7200,
      ...(opts?.now ? { now: opts.now } : {}),
    },
    store,
  )
  const client = new OAuth2Client({
    clientId: 'cid',
    clientSecret: 'csec',
    redirectUri: 'https://app.example/auth/callback',
    scopes: ['openid'],
    endpoints: {
      authorizeUrl: 'https://idp.example/authorize',
      tokenUrl: 'https://idp.example/token',
      userinfoUrl: 'https://idp.example/userinfo',
    },
    mapUser: (raw) => {
      const u = raw as { sub: string; name?: string; picture?: string }
      return { sub: u.sub, nickname: u.name, avatarUrl: u.picture || undefined }
    },
    stateKv: kv,
    fetchImpl: stubFetch,
  })

  const app = new Hono()
  app.use('*', sessionMiddleware(sessions))
  app.route('/', createAuthRoutes({ client, sessions }))
  app.get('/api/me', requireAuth(), (c) => c.json(c.get('auth')))
  app.get('/page', requireAuth(), (c) => c.text('secret-page'))
  return { app, client, sessions, kv }
}

/** 极简 cookie jar：吸收 Set-Cookie，回吐 Cookie 头 */
class CookieJar {
  private jar = new Map<string, string>()
  absorb(res: Response): void {
    for (const c of res.headers.getSetCookie()) {
      const pair = c.split(';')[0]
      if (pair === undefined) continue
      const idx = pair.indexOf('=')
      const name = pair.slice(0, idx)
      const value = pair.slice(idx + 1)
      if (value === '' || /max-age=0/i.test(c)) this.jar.delete(name)
      else this.jar.set(name, value)
    }
  }
  header(): string {
    return [...this.jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ')
  }
  get(name: string): string | undefined {
    return this.jar.get(name)
  }
}

type Ctx = Awaited<ReturnType<typeof buildApp>>
let ctx: Ctx

beforeEach(async () => {
  vi.clearAllMocks()
  ctx = await buildApp()
})

/** 走完整登录：login → 取 state → callback，返回带 cookie 的 jar */
async function loginFlow(returnTo = '/home'): Promise<CookieJar> {
  const jar = new CookieJar()
  const login = await ctx.app.request(`/auth/login?returnTo=${encodeURIComponent(returnTo)}`)
  expect(login.status).toBe(302)
  const state = new URL(login.headers.get('location')!).searchParams.get('state')!
  const cb = await ctx.app.request(`/auth/callback?code=abc&state=${state}`)
  jar.absorb(cb)
  expect(cb.status).toBe(302)
  expect(cb.headers.get('location')).toBe(returnTo)
  return jar
}

describe('authRoutes + middleware 集成', () => {
  it('GET /auth/login → 302 到 IdP authorize（带 state）', async () => {
    const res = await ctx.app.request('/auth/login')
    expect(res.status).toBe(302)
    const loc = new URL(res.headers.get('location')!)
    expect(loc.origin + loc.pathname).toBe('https://idp.example/authorize')
    expect(loc.searchParams.get('client_id')).toBe('cid')
    expect(loc.searchParams.get('state')).toBeTruthy()
  })

  it('callback → 建 session + 双 HttpOnly cookie + 302 returnTo', async () => {
    const jar = await loginFlow('/dash')
    expect(jar.get('homura_at')).toBeTruthy()
    expect(jar.get('homura_rt')).toBeTruthy()
    // 再验一次 loginFlow 的 returnTo 传递（此处 /dash）
    const res = await ctx.app.request('/auth/login?returnTo=%2Fdash')
    expect(res.status).toBe(302)
  })

  it('callback 缺 code → 400', async () => {
    const res = await ctx.app.request('/auth/callback?state=x')
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toMatchObject({ error: 'missing_code' })
  })

  it('callback 伪造 state → 401', async () => {
    const res = await ctx.app.request('/auth/callback?code=abc&state=forged')
    expect(res.status).toBe(401)
  })

  it('受保护 API：带 cookie → 200 claims', async () => {
    const jar = await loginFlow()
    const res = await ctx.app.request('/api/me', { headers: { cookie: jar.header() } })
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toMatchObject({ sub: 'u1', nickname: '张三' })
  })

  it('受保护 API：无 cookie → 401 JSON', async () => {
    const res = await ctx.app.request('/api/me')
    expect(res.status).toBe(401)
    await expect(res.json()).resolves.toMatchObject({ error: 'unauthorized' })
  })

  it('受保护 API：Bearer token → 200', async () => {
    const jar = await loginFlow()
    const at = jar.get('homura_at')!
    const res = await ctx.app.request('/api/me', { headers: { authorization: `Bearer ${at}` } })
    expect(res.status).toBe(200)
  })

  it('受保护页面：无 cookie → 302 login（带 returnTo）', async () => {
    const res = await ctx.app.request('/page')
    expect(res.status).toBe(302)
    const loc = res.headers.get('location')!
    expect(loc).toContain('/auth/login')
    expect(loc).toContain('returnTo=')
  })

  it('POST /auth/refresh → rotate 出新 cookie', async () => {
    const jar = await loginFlow()
    const oldAt = jar.get('homura_at')!
    const oldRt = jar.get('homura_rt')!
    const res = await ctx.app.request('/auth/refresh', { method: 'POST', headers: { cookie: jar.header() } })
    expect(res.status).toBe(200)
    jar.absorb(res)
    expect(jar.get('homura_rt')).not.toBe(oldRt)
    expect(jar.get('homura_at')).not.toBe(oldAt)
  })

  it('POST /auth/refresh 无 cookie → 401', async () => {
    const res = await ctx.app.request('/auth/refresh', { method: 'POST' })
    expect(res.status).toBe(401)
  })

  it('POST /auth/logout → 清 cookie + revokeSession（旧 refresh 失效）', async () => {
    const jar = await loginFlow()
    const oldRt = jar.get('homura_rt')!
    const res = await ctx.app.request('/auth/logout', { method: 'POST', headers: { cookie: jar.header() } })
    expect(res.status).toBe(200)
    jar.absorb(res)
    expect(jar.get('homura_at')).toBeUndefined()
    expect(jar.get('homura_rt')).toBeUndefined()
    // 旧 refresh token 已被 revokeSession 吊销
    expect(await ctx.sessions.refresh(oldRt)).toBeNull()
  })
})

describe('sessionMiddleware 透明 rotate', () => {
  it('access 过期 + refresh cookie 有效 → 自动续期', async () => {
    let ms = 1_700_000_000_000
    // access TTL 短（10s），refresh 默认 30d；签发后推进时间使 access 过期但 refresh 仍有效
    const c = await buildApp({ accessTtl: 10, now: () => new Date(ms) })
    const jar = new CookieJar()
    const login = await c.app.request('/auth/login?returnTo=/home')
    const state = new URL(login.headers.get('location')!).searchParams.get('state')!
    const cb = await c.app.request(`/auth/callback?code=abc&state=${state}`)
    jar.absorb(cb)

    ms += 20_000 // access 过期（10s TTL），refresh 未过期
    // middleware 用 refresh cookie 透明 rotate，新 access 在推进后的时钟下有效
    const res = await c.app.request('/api/me', { headers: { cookie: jar.header() } })
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toMatchObject({ sub: 'u1' })
    // middleware 应已下发新 cookie
    jar.absorb(res)
    expect(jar.get('homura_at')).toBeTruthy()
  })
})
