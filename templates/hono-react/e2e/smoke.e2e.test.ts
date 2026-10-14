/**
 * 模板 e2e 冒烟：走真实 buildApp 装配路径，注入桩（sqlite :memory: + 桩 IdP + fake genuine），
 * app.request() 全程不监听端口（快且稳）。
 *
 * 覆盖渐进式全链路：healthz → 匿名 todos CRUD → OAuth 登录建 session → /api/me
 * → 上传（local tmpdir）→ license suspended 503 → refresh rotate。
 */
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { sql } from 'drizzle-orm'
import { createSqliteDb } from '@homurajs/db'
import { runMigrations } from '@homurajs/db'
import { createLocalStorage } from '@homurajs/storage/local'
import { loadConfig } from '../src/server/env.js'
import { buildApp, type BuiltApp } from '../src/server/app.js'
import { fileURLToPath } from 'node:url'

const here = fileURLToPath(new URL('.', import.meta.url))
const MIGRATIONS = join(here, '../drizzle/sqlite')

/** 建 sqlite :memory: + 跑真实迁移 + 补建 auth 新表（迁移尚未重新生成） */
async function makeDb() {
  const db = createSqliteDb({ dialect: 'sqlite', path: ':memory:' })
  await runMigrations(db, MIGRATIONS)
  // auth 多凭证身份表（迁移将在 db:generate 后自动包含）
  await db.run(sql.raw(
    `CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY, username TEXT UNIQUE, nickname TEXT, avatar_url TEXT,
      created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
    )`,
  ))
  await db.run(sql.raw(
    `CREATE TABLE IF NOT EXISTS passwords (
      user_id TEXT PRIMARY KEY, password_hash TEXT NOT NULL,
      created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
    )`,
  ))
  await db.run(sql.raw(
    `CREATE TABLE IF NOT EXISTS oauth2_identity_links (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL, provider TEXT NOT NULL,
      provider_sub TEXT NOT NULL, raw_profile TEXT, created_at INTEGER NOT NULL
    )`,
  ))
  await db.run(sql.raw(
    `CREATE UNIQUE INDEX IF NOT EXISTS oauth2_links_provider_sub_uidx
     ON oauth2_identity_links (provider, provider_sub)`,
  ))
  await db.run(sql.raw(
    `CREATE TABLE IF NOT EXISTS webauthn_credentials (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL, public_key TEXT NOT NULL,
      counter INTEGER NOT NULL, device_type TEXT NOT NULL, backed_up INTEGER NOT NULL,
      transports TEXT, display_name TEXT, created_at INTEGER NOT NULL
    )`,
  ))
  return db
}

/** 桩 IdP：token → access_token，userinfo → 标准 OIDC */
function stubIdpFetch() {
  return vi.fn(async (url: string | URL | Request) => {
    const u = String(url)
    if (u.includes('/token')) {
      return new Response(
        JSON.stringify({ access_token: 'at-1', token_type: 'bearer', expires_in: 3600 }),
        { status: 200 },
      )
    }
    if (u.includes('/userinfo')) {
      return new Response(
        JSON.stringify({ sub: 'user-1', name: '张三', picture: 'http://a/p.png' }),
        { status: 200 },
      )
    }
    return new Response('', { status: 404 })
  }) as unknown as typeof fetch
}

/** 极简 cookie jar */
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

describe('模板 e2e — 渐进式全链路', () => {
  let built: BuiltApp
  let storageDir: string

  beforeAll(async () => {
    storageDir = mkdtempSync(join(tmpdir(), 'homura-e2e-files-'))
    const db = await makeDb()
    const config = loadConfig({
      DIALECT: 'sqlite',
      SESSION_SECRET: 'e2e-secret-key-that-is-long-enough-32b',
      // 启用 auth（oauth2-dingtalk 预设）
      OAUTH_DINGTALK_ORG_ID: 'test_org',
      OAUTH_CLIENT_ID: 'cid',
      OAUTH_CLIENT_SECRET: 'csec',
      OAUTH_REDIRECT_URI: 'https://app.test/auth/callback',
      // 启用 storage（local）
      STORAGE_BACKEND: 'local',
      STORAGE_LOCAL_DIR: storageDir,
    })
    built = await buildApp(config, {
      db: { kind: 'sql', db, dialect: 'sqlite' },
      skipMigrate: true, // 已手动迁移
      fetchImpl: stubIdpFetch(),
    })
  })

  afterEach(() => vi.clearAllMocks())

  it('healthz → 200 ok', async () => {
    const res = await built.app.request('/healthz')
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toMatchObject({ status: 'ok' })
  })

  it('匿名 todos CRUD（ownerSub=null 归属隔离）', async () => {
    // create
    const created = await built.app.request('/api/todos', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: '买牛奶' }),
    })
    expect(created.status).toBe(201)
    const { todo } = (await created.json()) as {
      todo: { id: string; title: string; done: boolean }
    }
    expect(todo.title).toBe('买牛奶')
    expect(todo.done).toBe(false)

    // list
    const listRes = await built.app.request('/api/todos')
    const { todos } = (await listRes.json()) as { todos: Array<{ id: string }> }
    expect(todos.some((t) => t.id === todo.id)).toBe(true)

    // toggle
    const toggled = await built.app.request(`/api/todos/${todo.id}`, { method: 'PATCH' })
    const { todo: t2 } = (await toggled.json()) as { todo: { done: boolean } }
    expect(t2.done).toBe(true)

    // delete
    const del = await built.app.request(`/api/todos/${todo.id}`, { method: 'DELETE' })
    expect(del.status).toBe(200)

    // 删除后 toggle → 404
    const gone = await built.app.request(`/api/todos/${todo.id}`, { method: 'PATCH' })
    expect(gone.status).toBe(404)
  })

  it('todos 校验：空 title → 400', async () => {
    const res = await built.app.request('/api/todos', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: '  ' }),
    })
    expect(res.status).toBe(400)
  })

  it('匿名 /api/me → user:null', async () => {
    const res = await built.app.request('/api/me')
    await expect(res.json()).resolves.toMatchObject({ user: null })
  })

  it('OAuth 登录全链路：authorize→callback→session→/api/me', async () => {
    const jar = new CookieJar()
    // authorize → 302 到 IdP authorize（带 state）
    const login = await built.app.request('/auth/oauth2/authorize?returnTo=%2Fdashboard')
    expect(login.status).toBe(302)
    const loc = new URL(login.headers.get('location')!)
    expect(loc.pathname).toBe('/test_org/authorize')
    const state = loc.searchParams.get('state')!

    // callback → 建 session + 双 cookie + 302 returnTo
    const cb = await built.app.request(`/auth/oauth2/callback?code=abc&state=${state}`)
    expect(cb.status).toBe(302)
    expect(cb.headers.get('location')).toBe('/dashboard')
    jar.absorb(cb)
    expect(jar.get('homura_at')).toBeTruthy()
    expect(jar.get('homura_rt')).toBeTruthy()

    // /api/me 带 cookie → 登录身份（sub 现在是 local user ID，不再是 IdP 的 'user-1'）
    const me = await built.app.request('/api/me', { headers: { cookie: jar.header() } })
    const meBody = await me.json() as { user: { sub: string; nickname?: string; avatarUrl?: string } }
    expect(meBody.user).toBeTruthy()
    expect(meBody.user.sub).toBeTruthy()
    expect(meBody.user.sub).not.toBe('user-1') // local user ID, not IdP sub
    expect(meBody.user.nickname).toBe('张三')
    const localSub = meBody.user.sub

    // 登录用户的 todos 与匿名隔离：登录后 list 看不到匿名 todos
    await built.app.request('/api/todos', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: jar.header() },
      body: JSON.stringify({ title: '登录用户的待办' }),
    })
    const mine = await built.app.request('/api/todos', { headers: { cookie: jar.header() } })
    const { todos } = (await mine.json()) as {
      todos: Array<{ title: string; ownerSub: string | null }>
    }
    expect(todos.every((t) => t.ownerSub === localSub)).toBe(true)
    expect(todos.some((t) => t.title === '登录用户的待办')).toBe(true)
  })

  it('refresh rotate：POST /auth/refresh 换新 cookie', async () => {
    const jar = new CookieJar()
    const login = await built.app.request('/auth/oauth2/authorize')
    const state = new URL(login.headers.get('location')!).searchParams.get('state')!
    const cb = await built.app.request(`/auth/oauth2/callback?code=abc&state=${state}`)
    jar.absorb(cb)
    const oldRt = jar.get('homura_rt')!

    const res = await built.app.request('/auth/refresh', {
      method: 'POST',
      headers: { cookie: jar.header() },
    })
    expect(res.status).toBe(200)
    jar.absorb(res)
    expect(jar.get('homura_rt')).not.toBe(oldRt)

    // 旧 refresh token 重放 → 复用检出 → 401
    const replay = await built.app.request('/auth/refresh', {
      method: 'POST',
      headers: { cookie: `homura_rt=${oldRt}` },
    })
    expect(replay.status).toBe(401)
  })

  it('上传：POST /api/upload（local 后端）→ 代理 URL → /files 下载', async () => {
    const file = new File([new Uint8Array([1, 2, 3, 4])], 'test.png', { type: 'image/png' })
    const fd = new FormData()
    fd.append('file', file)
    const res = await built.app.request('/api/upload', { method: 'POST', body: fd })
    expect(res.status).toBe(201)
    const { url, objectKey } = (await res.json()) as { url: string; objectKey: string }
    expect(url).toBe(`/files/${objectKey}`)
    expect(objectKey).toMatch(/^anon\/files\/\d+_test\.png$/)

    // 代理下载
    const dl = await built.app.request(url)
    expect(dl.status).toBe(200)
    expect(dl.headers.get('content-type')).toContain('image/png')
    expect(Array.from(new Uint8Array(await dl.arrayBuffer()))).toEqual([1, 2, 3, 4])
  })

  it('SPA fallback：未知页面路径 → index.html（若 staticDir 存在）', async () => {
    // buildApp 未传 staticDir → API 404 JSON（非 SPA）
    const res = await built.app.request('/some/page')
    expect(res.status).toBe(404)
  })
})

describe('模板 e2e — license 停服守卫', () => {
  it('genuine 下发 suspended → 业务 503，healthz 豁免', async () => {
    const db = await makeDb()
    // fake genuine：register 直接返回 suspended（已吊销 license 的合法场景），
    // 使 getStatus() 在 onStart() 后即为确定态——避免依赖心跳循环时序（不 flaky）
    const fakeGenuine = vi.fn(async (url: string | URL | Request) => {
      const u = String(url)
      if (u.includes('/register') || u.includes('/heartbeat')) {
        return new Response(
          JSON.stringify({
            licenseId: 'lic-1',
            status: 'suspended',
            heartbeatIntervalSec: 60,
            graceSec: 300,
            issuedAt: new Date().toISOString(),
            serverTime: new Date().toISOString(),
          }),
          { status: 200 },
        )
      }
      return new Response('', { status: 404 })
    }) as unknown as typeof fetch

    const config = loadConfig({
      DIALECT: 'sqlite',
      SESSION_SECRET: 'e2e-secret-key-that-is-long-enough-32b',
      GENUINE_SERVER: 'https://genuine.test',
      GENUINE_PRODUCT_ID: 'p',
      GENUINE_APP_ID: 'a',
    })
    const built = await buildApp(config, {
      db: { kind: 'sql', db, dialect: 'sqlite' },
      skipMigrate: true,
      fetchImpl: fakeGenuine,
    })
    await built.onStart?.() // register → status=suspended

    const client = built.deps.license as unknown as { getStatus(): string }
    expect(client.getStatus()).toBe('suspended')
    // suspended：业务 503
    expect((await built.app.request('/api/todos')).status).toBe(503)
    // healthz 豁免（探活始终可达）
    expect((await built.app.request('/healthz')).status).toBe(200)

    await built.onStop?.()
  })

  it('genuine active → 业务可达（fail-open 不误伤）', async () => {
    const db = await makeDb()
    const fakeGenuine = vi.fn(async (url: string | URL | Request) => {
      const u = String(url)
      if (u.includes('/register') || u.includes('/heartbeat')) {
        return new Response(
          JSON.stringify({
            licenseId: 'lic-2',
            status: 'active',
            heartbeatIntervalSec: 60,
            graceSec: 300,
            issuedAt: new Date().toISOString(),
            serverTime: new Date().toISOString(),
          }),
          { status: 200 },
        )
      }
      return new Response('', { status: 404 })
    }) as unknown as typeof fetch

    const config = loadConfig({
      DIALECT: 'sqlite',
      SESSION_SECRET: 'e2e-secret-key-that-is-long-enough-32b',
      GENUINE_SERVER: 'https://genuine.test',
      GENUINE_PRODUCT_ID: 'p',
      GENUINE_APP_ID: 'a',
    })
    const built = await buildApp(config, {
      db: { kind: 'sql', db, dialect: 'sqlite' },
      skipMigrate: true,
      fetchImpl: fakeGenuine,
    })
    await built.onStart?.()
    expect((await built.app.request('/api/todos')).status).toBe(200)
    await built.onStop?.()
  })
})
