import { beforeEach, describe, expect, it } from 'vitest'
import { sql } from 'drizzle-orm'
import { createSqliteDb } from '@homura/db'
import { SessionManager } from './manager.js'
import { createDrizzleSessionStore } from './store.js'
import type { AuthUser } from '../types.js'

const SECRET = 'a'.repeat(40) // >=32B
const USER: AuthUser = { sub: 'u1', nickname: '张三', avatarUrl: 'http://a' }

/** 建 :memory: sqlite + refresh_tokens 表 + SessionManager（await 建表完成） */
async function makeSession(opts?: {
  now?: () => Date
  accessTtl?: number
  refreshTtl?: number
}) {
  const db = createSqliteDb({ dialect: 'sqlite', path: ':memory:' })
  await db.run(sql.raw(
    `CREATE TABLE refresh_tokens (
      token_hash TEXT PRIMARY KEY,
      family_id TEXT NOT NULL,
      sid TEXT NOT NULL,
      sub TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      used_at INTEGER,
      profile TEXT
    )`,
  ))
  const store = createDrizzleSessionStore(db)
  const manager = new SessionManager(
    {
      secret: SECRET,
      accessTokenTtlSec: opts?.accessTtl ?? 7200,
      refreshTokenTtlSec: opts?.refreshTtl ?? 30 * 24 * 3600,
      ...(opts?.now ? { now: opts.now } : {}),
    },
    store,
  )
  return { db, manager, store }
}

let ctx: Awaited<ReturnType<typeof makeSession>>

beforeEach(async () => {
  ctx = await makeSession()
})

describe('SessionManager', () => {
  it('secret < 32B → 启动抛错', () => {
    expect(() => new SessionManager({ secret: 'short' }, ctx.store)).toThrow(/>= 32/)
  })

  it('createSession → verifyAccessToken 回读 claims（含 profile）', async () => {
    const { accessToken } = await ctx.manager.createSession(USER)
    const claims = await ctx.manager.verifyAccessToken(accessToken)
    expect(claims).toMatchObject({ sub: 'u1', nickname: '张三', avatarUrl: 'http://a' })
    expect(claims!.sid).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(claims!.exp).toBeGreaterThan(Math.floor(Date.now() / 1000))
  })

  it('伪造/篡改 token → verifyAccessToken 返回 null', async () => {
    expect(await ctx.manager.verifyAccessToken('garbage.token.value')).toBeNull()
    const { accessToken } = await ctx.manager.createSession(USER)
    expect(await ctx.manager.verifyAccessToken(accessToken + 'x')).toBeNull()
  })

  it('refresh：rotate 出新对，profile 回填，sid 不变', async () => {
    const t1 = await ctx.manager.createSession(USER)
    const t2 = await ctx.manager.refresh(t1.refreshToken)
    expect(t2).not.toBeNull()
    expect(t2!.refreshToken).not.toBe(t1.refreshToken)
    expect(t2!.accessToken).not.toBe(t1.accessToken)
    const sid1 = (await ctx.manager.verifyAccessToken(t1.accessToken))!.sid
    const claims = await ctx.manager.verifyAccessToken(t2!.accessToken)
    expect(claims).toMatchObject({ sub: 'u1', nickname: '张三', avatarUrl: 'http://a', sid: sid1 })
  })

  it('refresh：旧 token 重放 → 复用检出，整族吊销', async () => {
    const t1 = await ctx.manager.createSession(USER)
    const t2 = await ctx.manager.refresh(t1.refreshToken)
    expect(t2).not.toBeNull()
    // 重放旧 refresh token → 复用检出 → null
    expect(await ctx.manager.refresh(t1.refreshToken)).toBeNull()
    // 族吊销后，t2 也失效
    expect(await ctx.manager.refresh(t2!.refreshToken)).toBeNull()
  })

  it('refresh：不存在的 token → null', async () => {
    expect(await ctx.manager.refresh('nonexistent-token')).toBeNull()
  })

  it('revokeUser：吊销该用户所有未用 token', async () => {
    const t1 = await ctx.manager.createSession(USER)
    await ctx.manager.revokeUser('u1')
    expect(await ctx.manager.refresh(t1.refreshToken)).toBeNull()
  })

  it('revokeSession：按 sid 吊销整链', async () => {
    const t1 = await ctx.manager.createSession(USER)
    const claims = await ctx.manager.verifyAccessToken(t1.accessToken)
    await ctx.manager.revokeSession(claims!.sid)
    expect(await ctx.manager.refresh(t1.refreshToken)).toBeNull()
  })
})

describe('SessionManager — 时间边界', () => {
  it('now 注入：access token 过期后 verify 返回 null', async () => {
    let ms = 1_700_000_000_000
    const c = await makeSession({ now: () => new Date(ms), accessTtl: 10 })
    const { accessToken } = await c.manager.createSession(USER)
    expect(await c.manager.verifyAccessToken(accessToken)).not.toBeNull()
    ms += 11_000 // 超过 10s TTL
    expect(await c.manager.verifyAccessToken(accessToken)).toBeNull()
  })

  it('refresh token 过期（ttl=0）→ null', async () => {
    const c = await makeSession({ refreshTtl: 0 })
    const t1 = await c.manager.createSession(USER)
    expect(await c.manager.refresh(t1.refreshToken)).toBeNull()
  })
})
