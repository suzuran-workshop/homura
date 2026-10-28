/**
 * 主路由组合器 —— 按配置的能力（OIDC / Password）组装路由。
 *
 * createAuthRoutes(opts) 根据 opts 提供的 capability 自动组合：
 * - opts.oidc（OidcClient + IdentityResolver + provider）→ /auth/oidc/*
 * - opts.password（PasswordProvider）→ /auth/password/*
 * - 无条件挂载：/auth/refresh、/auth/logout
 *
 * WebAuthn 路由**不在**此组合器内——消费者从 @homurajs/auth/webauthn 取
 * createWebAuthnRoutes 自行挂载。
 */
import { Hono } from 'hono'
import { getCookie, setCookie } from 'hono/cookie'
import type { OidcClient } from '../oidc/client.js'
import type { SessionManager } from '../session/manager.js'
import type { IdentityResolver } from '../identity/resolver.js'
import type { PasswordProvider } from '../password/provider.js'
import { createOidcRoutes } from './oidc-routes.js'
import { createPasswordRoutes } from './password-routes.js'

export interface OidcInject {
  client: OidcClient
  identityResolver: IdentityResolver
  /** OIDC provider 标识（如 'dingtalk'） */
  provider: string
}

export interface AuthRoutesOptions {
  sessions: SessionManager
  /** OIDC 能力（不传则不挂载 OIDC 路由） */
  oidc?: OidcInject
  /** Password 能力（不传则不挂载 Password 路由） */
  password?: PasswordProvider
  /** 是否允许自助注册（默认 true） */
  allowRegister?: boolean
  /** cookie Secure（https 部署传 true） */
  secure?: boolean
  /** 登录成功后的缺省跳转 */
  defaultReturnTo?: string
}

/**
 * 组合 auth 路由：OIDC + Password（按配置）+ refresh + logout。
 */
export function createAuthRoutes(opts: AuthRoutesOptions): Hono {
  const { sessions } = opts
  const secure = opts.secure ?? false
  const names = sessions.cookies

  const app = new Hono()

  // OIDC 路由（可选）
  if (opts.oidc) {
    const oidcApp = createOidcRoutes({
      client: opts.oidc.client,
      sessions,
      identityResolver: opts.oidc.identityResolver,
      provider: opts.oidc.provider,
      secure,
      defaultReturnTo: opts.defaultReturnTo,
    })
    app.route('/', oidcApp)
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
