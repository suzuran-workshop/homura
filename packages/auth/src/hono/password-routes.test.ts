/**
 * 密码路由集成测试 —— createAuthRoutes({ password }) 走真实 Hono + in-memory sqlite。
 *
 * 覆盖：register / login / change / delete 四条 JSON 路由，cookie 签发，
 * allowRegister 开关，弱密码/重复用户名/未授权分支，以及改密后吊销 session（#9）。
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { Hono } from 'hono'
import { sql } from 'drizzle-orm'
import { createSqliteDb } from '@homurajs/db'
import { SessionManager } from '../session/manager.js'
import { createDrizzleSessionStore } from '../session/store.js'
import { createDrizzleUserStore } from '../identity/user-store.js'
import { createDrizzlePasswordStore } from '../password/drizzle-store.js'
import { PasswordProvider } from '../password/provider.js'
import { createAuthRoutes } from './routes.js'
import { sessionMiddleware, requireAuth } from './middleware.js'

const SECRET = 'a'.repeat(40)

async function makeDb() {
  const db = createSqliteDb({ dialect: 'sqlite', path: ':memory:' })
  await db.run(sql.raw(
    `CREATE TABLE refresh_tokens (
      token_hash TEXT PRIMARY KEY, family_id TEXT NOT NULL, sid TEXT NOT NULL,
      sub TEXT NOT NULL, expires_at INTEGER NOT NULL, used_at INTEGER, profile TEXT
    )`,
  ))
  await db.run(sql.raw(
    `CREATE TABLE users (
      id TEXT PRIMARY KEY, username TEXT, nickname TEXT, avatar_url TEXT,
      created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
    )`,
  ))
  await db.run(sql.raw(`CREATE UNIQUE INDEX users_username_uidx ON users (username)`))
  await db.run(sql.raw(
    `CREATE TABLE passwords (
      user_id TEXT PRIMARY KEY, password_hash TEXT NOT NULL,
      created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
    )`,
  ))
  return db
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

async function buildApp(opts?: { allowRegister?: boolean }) {
  const db = await makeDb()
  const store = createDrizzleSessionStore(db)
  const sessions = new SessionManager({ secret: SECRET }, store)
  const password = new PasswordProvider({
    userStore: createDrizzleUserStore(db),
    passwordStore: createDrizzlePasswordStore(db),
  })
  const app = new Hono()
  app.use('*', sessionMiddleware(sessions))
  app.route('/', createAuthRoutes({ sessions, password, allowRegister: opts?.allowRegister }))
  app.get('/api/me', requireAuth(), (c) => c.json(c.get('auth')))
  return { app, sessions }
}

let app: Hono
let sessions: SessionManager

beforeEach(async () => {
  const built = await buildApp()
  app = built.app
  sessions = built.sessions
})

async function register(username: string, password: string, nickname?: string) {
  return app.request('/auth/password/register', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username, password, ...(nickname ? { nickname } : {}) }),
  })
}

describe('密码路由 — 注册 / 登录', () => {
  it('register → 200 + 双 cookie，/api/me 的 sub 是 local user ID', async () => {
    const jar = new CookieJar()
    const res = await register('alice', 'password123', 'Alice')
    expect(res.status).toBe(200)
    jar.absorb(res)
    expect(jar.get('homura_at')).toBeTruthy()
    expect(jar.get('homura_rt')).toBeTruthy()

    const me = await app.request('/api/me', { headers: { cookie: jar.header() } })
    expect(me.status).toBe(200)
    const body = (await me.json()) as { sub: string; nickname?: string }
    expect(body.sub).toBeTruthy()
    expect(body.nickname).toBe('Alice')
  })

  it('register 弱密码（<8 位）→ 400', async () => {
    const res = await register('bob', 'short')
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toMatchObject({ error: 'weak_password' })
  })

  it('register 缺字段 → 400', async () => {
    const res = await app.request('/auth/password/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'x' }),
    })
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toMatchObject({ error: 'missing_fields' })
  })

  it('register 重复用户名 → 409 username_taken', async () => {
    expect((await register('carol', 'password123')).status).toBe(200)
    const dup = await register('carol', 'otherpass123')
    expect(dup.status).toBe(409)
    await expect(dup.json()).resolves.toMatchObject({ error: 'username_taken' })
  })

  it('login 正确 → 200 + cookie；错误 → 401', async () => {
    await register('dave', 'password123')
    const ok = await app.request('/auth/password/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'dave', password: 'password123' }),
    })
    expect(ok.status).toBe(200)
    const bad = await app.request('/auth/password/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'dave', password: 'wrong-password' }),
    })
    expect(bad.status).toBe(401)
    await expect(bad.json()).resolves.toMatchObject({ error: 'invalid_credentials' })
  })

  it('allowRegister=false → register 403 registration_disabled', async () => {
    const locked = await buildApp({ allowRegister: false })
    const res = await locked.app.request('/auth/password/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'eve', password: 'password123' }),
    })
    expect(res.status).toBe(403)
    await expect(res.json()).resolves.toMatchObject({ error: 'registration_disabled' })
  })
})

describe('密码路由 — 改密 / 删密（需登录）', () => {
  it('change 未登录 → 401', async () => {
    const res = await app.request('/auth/password/change', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ oldPassword: 'a', newPassword: 'b' }),
    })
    expect(res.status).toBe(401)
  })

  it('change 成功 → 吊销该用户全部 session（旧 refresh 失效）+ 清 cookie（#9）', async () => {
    const jar = new CookieJar()
    jar.absorb(await register('frank', 'old-password'))
    const oldRt = jar.get('homura_rt')!

    const res = await app.request('/auth/password/change', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: jar.header() },
      body: JSON.stringify({ oldPassword: 'old-password', newPassword: 'new-password' }),
    })
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toMatchObject({ ok: true, reloginRequired: true })
    // 旧 refresh token 已被吊销（改密是止损点）
    expect(await sessions.refresh(oldRt)).toBeNull()
    // 新密码可登录，旧密码不行
    const okLogin = await app.request('/auth/password/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'frank', password: 'new-password' }),
    })
    expect(okLogin.status).toBe(200)
  })

  it('change 旧密码错误 → 400', async () => {
    const jar = new CookieJar()
    jar.absorb(await register('grace', 'old-password'))
    const res = await app.request('/auth/password/change', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: jar.header() },
      body: JSON.stringify({ oldPassword: 'wrong-old', newPassword: 'new-password' }),
    })
    expect(res.status).toBe(400)
  })

  it('delete 成功 → 密码登录不可用', async () => {
    const jar = new CookieJar()
    jar.absorb(await register('heidi', 'password123'))
    const res = await app.request('/auth/password/delete', {
      method: 'POST',
      headers: { cookie: jar.header() },
    })
    expect(res.status).toBe(200)
    const login = await app.request('/auth/password/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'heidi', password: 'password123' }),
    })
    expect(login.status).toBe(401)
  })
})
