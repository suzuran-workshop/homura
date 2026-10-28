/**
 * OAuth2 路由（新路径统一到 /auth/oauth2/*）。
 *
 * GET  /auth/oauth2/authorize → 302 到 IdP authorize URL
 * GET  /auth/oauth2/callback  → identity resolver → session → 302 returnTo
 *
 * 旧路径 /auth/login + /auth/callback 已废弃（Breaking change）。
 */
import { Hono } from 'hono'
import { setCookie } from 'hono/cookie'
import type { OAuth2Client } from '../oauth2/client.js'
import type { SessionManager } from '../session/manager.js'
import type { IdentityResolver } from '../identity/resolver.js'
import { IdentityNotLinkedError, ProvisionBlockedError } from '../identity/resolver.js'
import type { AuthUser } from '../types.js'

export interface OAuth2Paths {
  authorize?: string
  callback?: string
}

export interface OAuth2RoutesOptions {
  client: OAuth2Client
  sessions: SessionManager
  /** OAuth2 回调时调用：IdP sub → local user */
  identityResolver: IdentityResolver
  /** OAuth2 provider 标识（如 'dingtalk'），用于 identity link */
  provider: string
  paths?: OAuth2Paths
  /** cookie Secure（https 部署传 true） */
  secure?: boolean
  /** 登录成功后的缺省跳转（returnTo 优先） */
  defaultReturnTo?: string
}

export function createOAuth2Routes(opts: OAuth2RoutesOptions): Hono {
  const { client, sessions, identityResolver, provider } = opts
  const paths = {
    authorize: opts.paths?.authorize ?? '/auth/oauth2/authorize',
    callback: opts.paths?.callback ?? '/auth/oauth2/callback',
  }
  const secure = opts.secure ?? false
  const names = sessions.cookies

  const app = new Hono()

  app.get(paths.authorize, async (c) => {
    const returnTo = c.req.query('returnTo')
    const url = await client.authorizeUrl(returnTo)
    return c.redirect(url)
  })

  app.get(paths.callback, async (c) => {
    const code = c.req.query('code')
    const state = c.req.query('state')
    if (!code) return c.json({ error: 'missing_code' }, 400)
    try {
      const { user: idpUser, returnTo } = await client.callback({ code, state: state ?? undefined })
      // identity resolver：IdP sub → local user（JIT 或拒绝）
      const localUser = await identityResolver.resolve(provider, idpUser.sub, {
        nickname: idpUser.nickname,
        avatarUrl: idpUser.avatarUrl,
      })
      // session 的 sub 现在是 local user.id
      const authUser: AuthUser = {
        sub: localUser.id,
        nickname: localUser.nickname ?? idpUser.nickname,
        avatarUrl: localUser.avatarUrl ?? idpUser.avatarUrl,
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
      return c.redirect(returnTo || opts.defaultReturnTo || '/')
    } catch (e) {
      if (e instanceof IdentityNotLinkedError) {
        return c.json({ error: 'identity_not_linked', message: e.message }, 403)
      }
      if (e instanceof ProvisionBlockedError) {
        // 目录白名单准入被拒：reason 供 App 映射友好错误页
        return c.json(
          { error: 'provision_blocked', reason: e.reason, message: e.message },
          403,
        )
      }
      return c.json({ error: 'oauth_failed', message: (e as Error).message }, 401)
    }
  })

  return app
}
