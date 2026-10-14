import { getCookie, setCookie } from 'hono/cookie'
import type { MiddlewareHandler } from 'hono'
import type { SessionClaims, SessionManager } from '../session/manager.js'

export interface SessionMiddlewareOptions {
  /** 允许 Authorization: Bearer（默认 true） */
  bearer?: boolean
  /** cookie Secure 属性（qw-pages/https 传 true；本地 http dev 传 false） */
  secure?: boolean
}

/**
 * cookie 优先、Authorization: Bearer 兼容；
 * access 过期且 refresh cookie 有效 → 透明 rotate 续期；c.set('auth', claims)。
 * 无身份不报错（交给 requireAuth 决定 401/302）。
 */
export function sessionMiddleware(
  sessions: SessionManager,
  opts?: SessionMiddlewareOptions,
): MiddlewareHandler {
  const bearer = opts?.bearer ?? true
  const secure = opts?.secure ?? false
  const names = sessions.cookies

  return async (c, next) => {
    let token = getCookie(c, names.access)
    if (!token && bearer) {
      const auth = c.req.header('authorization')
      if (auth?.startsWith('Bearer ')) token = auth.slice('Bearer '.length)
    }

    let claims = token ? await sessions.verifyAccessToken(token) : null

    // access 过期但有 refresh cookie → 透明 rotate
    if (!claims) {
      const refreshToken = getCookie(c, names.refresh)
      if (refreshToken) {
        const rotated = await sessions.refresh(refreshToken)
        if (rotated) {
          claims = await sessions.verifyAccessToken(rotated.accessToken)
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
        }
      }
    }

    if (claims) c.set('auth', claims)
    await next()
  }
}

/**
 * 无身份：/api 或 Accept:json → 401 JSON；页面请求 → 302 login。
 *
 * ⚠ loginPath 缺省 = OAuth2 授权入口 `/auth/oauth2/authorize`（旧 `/auth/login` 已废弃，
 *   见 ADR-022）。SDK 不渲染登录页，故缺省指向唯一内置的 GET 登录入口；
 *   纯密码认证或自带登录 UI 的 App 必须显式传 `loginPath` 指向自己的登录页，
 *   否则页面请求会 302 到一个不存在的路径（被 SPA fallback 判成 404 JSON）。
 */
export function requireAuth(opts?: { loginPath?: string }): MiddlewareHandler {
  const loginPath = opts?.loginPath ?? '/auth/oauth2/authorize'
  return async (c, next) => {
    if (c.get('auth')) {
      await next()
      return
    }
    const isApi = c.req.path.startsWith('/api') || c.req.header('accept')?.includes('application/json')
    if (isApi) {
      return c.json({ error: 'unauthorized' }, 401)
    }
    const returnTo = c.req.url
    return c.redirect(`${loginPath}?returnTo=${encodeURIComponent(returnTo)}`)
  }
}

export type { SessionClaims }

declare module 'hono' {
  interface ContextVariableMap {
    auth: SessionClaims
  }
}
