/**
 * WebAuthn 路由（JSON API，不渲染页面）。
 *
 * POST /auth/webauthn/register/options  → 已登录用户 → registration options JSON
 * POST /auth/webauthn/register/verify   → 验证 attestation → 存储凭证 → 200 JSON
 * POST /auth/webauthn/auth/options      → authentication options JSON
 * POST /auth/webauthn/auth/verify       → 验证 assertion → session cookies + 200 JSON
 * GET  /auth/webauthn/credentials       → 已登录用户 → 凭证列表
 * POST /auth/webauthn/credentials/delete → 已登录用户 → 删除指定凭证
 *
 * 独立子路径，消费者从 @homurajs/auth/webauthn 取 createWebAuthnRoutes 自行挂载。
 */
import { Hono } from 'hono'
import { setCookie } from 'hono/cookie'
import type { SessionManager } from '../session/manager.js'
import type { WebAuthProvider } from './provider.js'
import type { AuthUser } from '../types.js'

export interface WebAuthnPaths {
  registerOptions?: string
  registerVerify?: string
  authOptions?: string
  authVerify?: string
  listCredentials?: string
  deleteCredential?: string
}

export interface WebAuthnRoutesOptions {
  webauthn: WebAuthProvider
  sessions: SessionManager
  paths?: WebAuthnPaths
  secure?: boolean
}

export function createWebAuthnRoutes(opts: WebAuthnRoutesOptions): Hono {
  const { webauthn, sessions } = opts
  const paths = {
    registerOptions: opts.paths?.registerOptions ?? '/auth/webauthn/register/options',
    registerVerify: opts.paths?.registerVerify ?? '/auth/webauthn/register/verify',
    authOptions: opts.paths?.authOptions ?? '/auth/webauthn/auth/options',
    authVerify: opts.paths?.authVerify ?? '/auth/webauthn/auth/verify',
    listCredentials: opts.paths?.listCredentials ?? '/auth/webauthn/credentials',
    deleteCredential: opts.paths?.deleteCredential ?? '/auth/webauthn/credentials/delete',
  }
  const secure = opts.secure ?? false
  const names = sessions.cookies

  const app = new Hono()

  // ── 注册 ceremony ──────────────────────────────────

  app.post(paths.registerOptions, async (c) => {
    const claims = c.get('auth')
    if (!claims) return c.json({ error: 'unauthorized' }, 401)
    try {
      const options = await webauthn.generateRegistrationOptions(claims.sub)
      return c.json(options)
    } catch (e) {
      return c.json({ error: 'options_failed', message: (e as Error).message }, 400)
    }
  })

  app.post(paths.registerVerify, async (c) => {
    const claims = c.get('auth')
    if (!claims) return c.json({ error: 'unauthorized' }, 401)
    let body: { response?: unknown; displayName?: string }
    try {
      body = await c.req.json()
    } catch {
      return c.json({ error: 'invalid_body' }, 400)
    }
    if (!body.response) {
      return c.json({ error: 'missing_response' }, 400)
    }
    try {
      const result = await webauthn.verifyRegistration(
        claims.sub,
        body.response as never,
        body.displayName,
      )
      return c.json({ ok: true, credentialId: result.id })
    } catch (e) {
      return c.json({ error: 'verify_failed', message: (e as Error).message }, 400)
    }
  })

  // ── 认证 ceremony ──────────────────────────────────

  app.post(paths.authOptions, async (c) => {
    let body: { userId?: string } = {}
    try {
      body = (await c.req.json().catch(() => ({}))) as { userId?: string }
    } catch {
      // 空 body 也可以
    }
    try {
      const options = await webauthn.generateAuthenticationOptions(body.userId)
      return c.json(options)
    } catch (e) {
      return c.json({ error: 'options_failed', message: (e as Error).message }, 400)
    }
  })

  app.post(paths.authVerify, async (c) => {
    let body: { response?: unknown }
    try {
      body = await c.req.json()
    } catch {
      return c.json({ error: 'invalid_body' }, 400)
    }
    if (!body.response) {
      return c.json({ error: 'missing_response' }, 400)
    }
    try {
      const user = await webauthn.verifyAuthentication(body.response as never)
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
      return c.json({
        ok: true,
        user: { id: user.id, username: user.username, nickname: user.nickname },
      })
    } catch (e) {
      return c.json({ error: 'verify_failed', message: (e as Error).message }, 401)
    }
  })

  // ── 凭证管理 ───────────────────────────────────────

  app.get(paths.listCredentials, async (c) => {
    const claims = c.get('auth')
    if (!claims) return c.json({ error: 'unauthorized' }, 401)
    const creds = await webauthn.listCredentials(claims.sub)
    return c.json({
      credentials: creds.map((c) => ({
        id: c.id,
        displayName: c.displayName,
        deviceType: c.deviceType,
        backedUp: c.backedUp === 1,
        createdAt: c.createdAt,
      })),
    })
  })

  app.post(paths.deleteCredential, async (c) => {
    const claims = c.get('auth')
    if (!claims) return c.json({ error: 'unauthorized' }, 401)
    let body: { credentialId?: string }
    try {
      body = await c.req.json()
    } catch {
      return c.json({ error: 'invalid_body' }, 400)
    }
    if (!body.credentialId) {
      return c.json({ error: 'missing_credential_id' }, 400)
    }
    try {
      await webauthn.deleteCredential(claims.sub, body.credentialId)
      return c.json({ ok: true })
    } catch (e) {
      return c.json({ error: 'delete_failed', message: (e as Error).message }, 400)
    }
  })

  return app
}
