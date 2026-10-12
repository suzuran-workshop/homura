import { Hono } from 'hono'
import { getCookie, setCookie } from 'hono/cookie'
import type { OAuth2Client } from '../oauth2/client.js'
import type { SessionManager } from '../session/manager.js'

export interface AuthPaths {
  login?: string
  callback?: string
  refresh?: string
  logout?: string
}

export interface AuthRoutesOptions {
  client: OAuth2Client
  sessions: SessionManager
  paths?: AuthPaths
  /** cookie Secure（qw-pages/https 传 true） */
  secure?: boolean
  /** 登录成功后的缺省跳转（returnTo 优先） */
  defaultReturnTo?: string
}

/**
 * GET  /auth/login    → 302 authorize（returnTo via query）
 * GET  /auth/callback → 建 session 写双 cookie → 302 returnTo
 * POST /auth/refresh  → rotate（读 refresh cookie）
 * POST /auth/logout   → 吊销 session + 清 cookie
 */
export function createAuthRoutes(opts: AuthRoutesOptions): Hono {
  const { client, sessions } = opts
  const paths = {
    login: opts.paths?.login ?? '/auth/login',
    callback: opts.paths?.callback ?? '/auth/callback',
    refresh: opts.paths?.refresh ?? '/auth/refresh',
    logout: opts.paths?.logout ?? '/auth/logout',
  }
  const secure = opts.secure ?? false
  const names = sessions.cookies

  const app = new Hono()

  app.get(paths.login, async (c) => {
    const returnTo = c.req.query('returnTo')
    const url = await client.authorizeUrl(returnTo)
    return c.redirect(url)
  })

  app.get(paths.callback, async (c) => {
    const code = c.req.query('code')
    const state = c.req.query('state')
    if (!code) return c.json({ error: 'missing_code' }, 400)
    try {
      const { user, returnTo } = await client.callback({ code, state: state ?? undefined })
      const tokens = await sessions.createSession(user)
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
      return c.redirect(returnTo || opts.defaultReturnTo || '/')
    } catch (e) {
      return c.json({ error: 'oauth_failed', message: (e as Error).message }, 401)
    }
  })

  app.post(paths.refresh, async (c) => {
    const refreshToken = getCookie(c, names.refresh)
    if (!refreshToken) return c.json({ error: 'no_refresh_token' }, 401)
    const rotated = await sessions.refresh(refreshToken)
    if (!rotated) return c.json({ error: 'invalid_refresh_token' }, 401)
    setCookie(c, names.access, rotated.accessToken, {
      httpOnly: true,
      sameSite: 'Lax',
      secure,
      path: '/',
      maxAge: sessions.accessTokenTtlSec,
    })
    setCookie(c, names.refresh, rotated.refreshToken, {
      httpOnly: true,
      sameSite: 'Lax',
      secure,
      path: '/',
      maxAge: sessions.refreshTokenTtlSec,
    })
    return c.json({ ok: true })
  })

  app.post(paths.logout, async (c) => {
    const claims = c.get('auth')
    if (claims?.sid) await sessions.revokeSession(claims.sid)
    setCookie(c, names.access, '', { httpOnly: true, secure, path: '/', maxAge: 0 })
    setCookie(c, names.refresh, '', { httpOnly: true, secure, path: '/', maxAge: 0 })
    return c.json({ ok: true })
  })

  return app
}
