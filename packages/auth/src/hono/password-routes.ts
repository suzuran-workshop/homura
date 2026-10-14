/**
 * 密码认证路由（JSON API，不渲染页面）。
 *
 * POST /auth/password/register → 注册（username + password）→ session cookies + 200 JSON
 * POST /auth/password/login    → 登录 → session cookies + 200 JSON
 * POST /auth/password/change   → 改密码（需已登录）→ 200 JSON
 * POST /auth/password/delete   → 删密码（需已登录）→ 200 JSON
 */
import { Hono } from 'hono'
import { setCookie } from 'hono/cookie'
import type { SessionManager } from '../session/manager.js'
import type { PasswordProvider } from '../password/provider.js'
import { UsernameTakenError } from '../password/provider.js'
import type { AuthUser } from '../types.js'

/**
 * 跨方言唯一约束冲突判定（username 并发注册的兜底）。
 *
 * ⚠ 必须走 cause 链：drizzle 把底层驱动错误包成 DrizzleQueryError，其顶层 message 是
 *   "Failed query: INSERT ..."，**不含** UNIQUE 字样——只看顶层 message 会漏判（曾导致
 *   重复用户名注册回落 400 而非 409）。真正的信号在 cause：
 *   - sqlite：cause.errcode === 2067（SQLITE_CONSTRAINT_UNIQUE），cause.message 含 "UNIQUE constraint failed"
 *   - pg：cause.code === '23505'（unique_violation），message 含 "duplicate key"
 *   逐层向下最多走 5 层，命中任一信号即判定为唯一冲突。
 */
function isUniqueViolation(e: unknown): boolean {
  let cur = e as { cause?: unknown; message?: unknown; code?: unknown; errcode?: unknown } | null
  for (let depth = 0; cur && depth < 5; depth++) {
    if (cur.errcode === 2067) return true // SQLITE_CONSTRAINT_UNIQUE
    if (cur.code === '23505') return true // pg unique_violation
    if (typeof cur.message === 'string' && /unique constraint|duplicate key|unique violation/i.test(cur.message)) {
      return true
    }
    cur = cur.cause as typeof cur
  }
  return false
}

export interface PasswordPaths {
  register?: string
  login?: string
  change?: string
  delete?: string
}

export interface PasswordRoutesOptions {
  password: PasswordProvider
  sessions: SessionManager
  /** 是否允许自助注册（默认 true） */
  allowRegister?: boolean
  paths?: PasswordPaths
  secure?: boolean
}

export function createPasswordRoutes(opts: PasswordRoutesOptions): Hono {
  const { password, sessions } = opts
  const allowRegister = opts.allowRegister ?? true
  const paths = {
    register: opts.paths?.register ?? '/auth/password/register',
    login: opts.paths?.login ?? '/auth/password/login',
    change: opts.paths?.change ?? '/auth/password/change',
    delete: opts.paths?.delete ?? '/auth/password/delete',
  }
  const secure = opts.secure ?? false
  const names = sessions.cookies

  const app = new Hono()

  // ── 注册 ────────────────────────────────────────────

  app.post(paths.register, async (c) => {
    if (!allowRegister) {
      return c.json({ error: 'registration_disabled', message: '自助注册已关闭' }, 403)
    }
    let body: { username?: string; password?: string; nickname?: string }
    try {
      body = await c.req.json()
    } catch {
      return c.json({ error: 'invalid_body' }, 400)
    }
    if (!body.username || !body.password) {
      return c.json({ error: 'missing_fields', message: '需要 username 和 password' }, 400)
    }
    if (body.password.length < 8) {
      return c.json({ error: 'weak_password', message: '密码至少 8 位' }, 400)
    }
    try {
      const user = await password.register({
        username: body.username,
        password: body.password,
        nickname: body.nickname,
      })
      const authUser: AuthUser = {
        sub: user.id,
        nickname: user.nickname ?? undefined,
        avatarUrl: user.avatarUrl ?? undefined,
      }
      const tokens = await sessions.createSession(authUser)
      setCookie(c, names.access, tokens.accessToken, {
        httpOnly: true,
        sameSite: 'Lax',
        secure,
        path: '/',
        maxAge: sessions.accessTokenTtlSec,
      })
      setCookie(c, names.refresh, tokens.refreshToken, {
        httpOnly: true,
        sameSite: 'Lax',
        secure,
        path: '/',
        maxAge: sessions.refreshTokenTtlSec,
      })
      return c.json({ ok: true, user: { id: user.id, username: user.username, nickname: user.nickname } })
    } catch (e) {
      // username 占用：预检抛的类型化错误，或并发撞唯一索引（走 cause 链识别）→ 409
      if (e instanceof UsernameTakenError || isUniqueViolation(e)) {
        return c.json({ error: 'username_taken', message: '用户名已被注册' }, 409)
      }
      return c.json({ error: 'register_failed', message: (e as Error).message }, 400)
    }
  })

  // ── 登录 ────────────────────────────────────────────

  app.post(paths.login, async (c) => {
    let body: { username?: string; password?: string }
    try {
      body = await c.req.json()
    } catch {
      return c.json({ error: 'invalid_body' }, 400)
    }
    if (!body.username || !body.password) {
      return c.json({ error: 'missing_fields', message: '需要 username 和 password' }, 400)
    }
    const user = await password.verify(body.username, body.password)
    if (!user) {
      return c.json({ error: 'invalid_credentials', message: '用户名或密码错误' }, 401)
    }
    const authUser: AuthUser = {
      sub: user.id,
      nickname: user.nickname ?? undefined,
      avatarUrl: user.avatarUrl ?? undefined,
    }
    const tokens = await sessions.createSession(authUser)
    setCookie(c, names.access, tokens.accessToken, {
      httpOnly: true,
      sameSite: 'Lax',
      secure,
      path: '/',
      maxAge: sessions.accessTokenTtlSec,
    })
    setCookie(c, names.refresh, tokens.refreshToken, {
      httpOnly: true,
      sameSite: 'Lax',
      secure,
      path: '/',
      maxAge: sessions.refreshTokenTtlSec,
    })
    return c.json({ ok: true, user: { id: user.id, username: user.username, nickname: user.nickname } })
  })

  // ── 改密码（需已登录，sessionMiddleware 注入 auth）──

  app.post(paths.change, async (c) => {
    const claims = c.get('auth')
    if (!claims) return c.json({ error: 'unauthorized' }, 401)
    let body: { oldPassword?: string; newPassword?: string }
    try {
      body = await c.req.json()
    } catch {
      return c.json({ error: 'invalid_body' }, 400)
    }
    if (!body.oldPassword || !body.newPassword) {
      return c.json({ error: 'missing_fields', message: '需要 oldPassword 和 newPassword' }, 400)
    }
    if (body.newPassword.length < 8) {
      return c.json({ error: 'weak_password', message: '密码至少 8 位' }, 400)
    }
    try {
      await password.changePassword(claims.sub, body.oldPassword, body.newPassword)
      // 安全：改密后吊销该用户**所有** session 的 refresh token（含当前会话）。
      // 否则此前被盗的 refresh token 在改密后依然能 rotate 续命——改密本应是止损点。
      // access token 是无状态 JWT，会在自身 TTL 内自然过期；refresh 链已断，无法再续。
      // 代价是当前会话也需重新登录（reloginRequired），这是密码修改的标准安全语义。
      await sessions.revokeUser(claims.sub)
      setCookie(c, names.access, '', { httpOnly: true, secure, path: '/', maxAge: 0 })
      setCookie(c, names.refresh, '', { httpOnly: true, secure, path: '/', maxAge: 0 })
      return c.json({ ok: true, reloginRequired: true })
    } catch (e) {
      return c.json({ error: 'change_failed', message: (e as Error).message }, 400)
    }
  })

  // ── 删密码（需已登录）──────────────────────────────

  app.post(paths.delete, async (c) => {
    const claims = c.get('auth')
    if (!claims) return c.json({ error: 'unauthorized' }, 401)
    try {
      await password.deletePassword(claims.sub)
      return c.json({ ok: true })
    } catch (e) {
      return c.json({ error: 'delete_failed', message: (e as Error).message }, 400)
    }
  })

  return app
}
