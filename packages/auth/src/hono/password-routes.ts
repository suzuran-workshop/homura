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
import type { AuthUser } from '../types.js'

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
      const msg = (e as Error).message
      if (msg.includes('UNIQUE') || msg.includes('unique') || msg.includes('duplicate')) {
        return c.json({ error: 'username_taken', message: '用户名已被注册' }, 409)
      }
      return c.json({ error: 'register_failed', message: msg }, 400)
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
      return c.json({ ok: true })
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
