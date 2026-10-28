/**
 * OIDC 路由（路径 /auth/oidc/*）。
 *
 * GET  /auth/oidc/authorize → 302 到 IdP authorize URL
 * GET  /auth/oidc/callback  → id_token 验签 → identity resolver → session → 302 returnTo
 *
 * 客户端内部强制 id_token 验签 + userinfo.sub 交叉核对，验签类失败
 * （OidcError: missing_id_token / id_token_invalid / sub_mismatch）返回 401。
 */
import { Hono } from 'hono'
import { setCookie } from 'hono/cookie'
import type { OidcClient } from '../oidc/client.js'
import { OidcError } from '../oidc/client.js'
import type { SessionManager } from '../session/manager.js'
import type { IdentityResolver } from '../identity/resolver.js'
import { IdentityNotLinkedError, ProvisionBlockedError } from '../identity/resolver.js'
import type { AuthUser } from '../types.js'

export interface OidcPaths {
  authorize?: string
  callback?: string
}

export interface OidcRoutesOptions {
  client: OidcClient
  sessions: SessionManager
  /** OIDC 回调时调用：IdP sub → local user */
  identityResolver: IdentityResolver
  /** OIDC provider 标识（如 'dingtalk'），用于 identity link */
  provider: string
  paths?: OidcPaths
  /** cookie Secure（https 部署传 true） */
  secure?: boolean
  /** 登录成功后的缺省跳转（returnTo 优先） */
  defaultReturnTo?: string
}

export function createOidcRoutes(opts: OidcRoutesOptions): Hono {
  const { client, sessions, identityResolver, provider } = opts
  const paths = {
    authorize: opts.paths?.authorize ?? '/auth/oidc/authorize',
    callback: opts.paths?.callback ?? '/auth/oidc/callback',
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
      // identity resolver：IdP sub → local user（目录准入 JIT 或拒绝）
      const localUser = await identityResolver.resolve(provider, idpUser.sub, {
        nickname: idpUser.nickname,
        avatarUrl: idpUser.avatarUrl,
      })
      // session 的 sub 是 local user.id
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
      if (e instanceof OidcError) {
        // OIDC 协议失败（state/验签/sub 交叉核对/token 端点）
        return c.json({ error: 'oidc_failed', code: e.code, message: e.message }, 401)
      }
      return c.json({ error: 'oauth_failed', message: (e as Error).message }, 401)
    }
  })

  return app
}
