/**
 * 主路由组合器 —— 按配置的能力（OAuth2 / Password）组装路由。
 *
 * createAuthRoutes(opts) 根据 opts 提供的 capability 自动组合：
 * - opts.oauth2（OAuth2Client + IdentityResolver + provider）→ /auth/oauth2/*
 * - opts.password（PasswordProvider）→ /auth/password/*
 * - 无条件挂载：/auth/refresh、/auth/logout
 *
 * WebAuthn 路由**不在**此组合器内——消费者从 @homurajs/auth/webauthn 取
 * createWebAuthnRoutes 自行挂载。
 *
 * ⚠ Breaking：旧 /auth/login + /auth/callback 路径已迁移到 /auth/oauth2/*。
 */
import { Hono } from 'hono'
import { getCookie, setCookie } from 'hono/cookie'
import type { OAuth2Client } from '../oauth2/client.js'
import type { SessionManager } from '../session/manager.js'
import type { IdentityResolver } from '../identity/resolver.js'
import type { PasswordProvider } from '../password/provider.js'
import { createOAuth2Routes } from './oauth2-routes.js'
import { createPasswordRoutes } from './password-routes.js'

export interface OAuth2Inject {
  client: OAuth2Client
  identityResolver: IdentityResolver
  /** OAuth2 provider 标识（如 'dingtalk'） */
  provider: string
}

export interface AuthRoutesOptions {
  sessions: SessionManager
  /** OAuth2 能力（不传则不挂载 OAuth2 路由） */
  oauth2?: OAuth2Inject
  /** Password 能力（不传则不挂载 Password 路由） */
  password?: PasswordProvider
  /** 是否允许自助注册（默认 true） */
  allowRegister?: boolean
  /** cookie Secure（qw-pages/https 传 true） */
  secure?: boolean
  /** 登录成功后的缺省跳转 */
  defaultReturnTo?: string
}

/**
 * 组合 auth 路由：OAuth2 + Password（按配置）+ refresh + logout。
 */
export function createAuthRoutes(opts: AuthRoutesOptions): Hono {
  const { sessions } = opts
  const secure = opts.secure ?? false
  const names = sessions.cookies

  const app = new Hono()

  // OAuth2 路由（可选）
  if (opts.oauth2) {
    const oauth2App = createOAuth2Routes({
      client: opts.oauth2.client,
      sessions,
      identityResolver: opts.oauth2.identityResolver,
      provider: opts.oauth2.provider,
      secure,
      defaultReturnTo: opts.defaultReturnTo,
    })
    app.route('/', oauth2App)
  }

  // Password 路由（可选）
  if (opts.password) {
    const passwordApp = createPasswordRoutes({
      password: opts.password,
      sessions,
      allowRegister: opts.allowRegister,
      secure,
    })
    app.route('/', passwordApp)
  }

  // ── 通用路由（无条件挂载）─────────────────────────

  app.post('/auth/refresh', async (c) => {
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

  app.post('/auth/logout', async (c) => {
    const claims = c.get('auth')
    if (claims?.sid) await sessions.revokeSession(claims.sid)
    setCookie(c, names.access, '', { httpOnly: true, secure, path: '/', maxAge: 0 })
    setCookie(c, names.refresh, '', { httpOnly: true, secure, path: '/', maxAge: 0 })
    return c.json({ ok: true })
  })

  return app
}
