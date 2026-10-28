import { jwtVerify } from 'jose'
import { randomToken } from '@homurajs/core'
import type { TtlKv } from '@homurajs/core'
import type { AuthUser, OidcEndpoints, OidcTokenResponse } from '../types.js'

export interface OidcClientConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  /** 默认 ['openid'] */
  scopes?: string[]
  /** IdP issuer（id_token 的 iss 校验值，如 https://idp.example/my_org） */
  issuer: string
  endpoints: OidcEndpoints
  /** 上游原始 userinfo → 规范身份（预设来自 @homurajs/3p/*） */
  mapUser: (raw: unknown) => AuthUser
  /** state 存储（core 的内存或 db 实现），TTL 5min 一次性消费 */
  stateKv: TtlKv
  /** 测试注入口；全程不 mock 全局 fetch */
  fetchImpl?: typeof fetch
  authorizeExtraParams?: Record<string, string>
  /** dev 显式 opt-in 才允许无 state（修复 Suzuran 的 Redis 缺失放行后门） */
  allowNoState?: boolean
  /** state TTL（默认 5min） */
  stateTtlMs?: number
  /** id_token 验签时钟容忍秒数（默认 60） */
  leewaySec?: number
}

const DEFAULT_STATE_TTL = 5 * 60_000
const DEFAULT_LEEWAY_SEC = 60

/**
 * OIDC 协议错误（区别于网络/上游错误，App 可按类型渲染友好页）。
 * code：invalid_state / missing_code / token_failed / userinfo_failed /
 *       missing_id_token / id_token_invalid / sub_mismatch / map_failed
 */
export class OidcError extends Error {
  constructor(
    public readonly code:
      | 'invalid_state'
      | 'missing_code'
      | 'token_failed'
      | 'userinfo_failed'
      | 'missing_id_token'
      | 'id_token_invalid'
      | 'sub_mismatch'
      | 'map_failed',
    message: string,
  ) {
    super(`[${code}] ${message}`)
    this.name = 'OidcError'
  }
}

/**
 * 标准 OIDC (Authorization Code Flow) 客户端。
 *
 * 与裸 OAuth2 客户端的本质区别：token 响应中的 `id_token`（HS256 签名 JWT，
 * 密钥即 clientSecret）是身份的**密码学证明**——本类强制验签并校验
 * iss/aud/exp，再把 userinfo 的 sub 与 id_token 的 sub 交叉核对后
 * 才交给 mapUser/IdentityResolver。信任锚是签名，不是「上游说了算」。
 *
 * 服务端（如 ../oidc-dingtalk）由 3p 预设注入，本类不感知具体 IdP。
 */
export class OidcClient {
  private fetchImpl: typeof fetch
  private stateTtl: number
  private leewaySec: number

  constructor(private config: OidcClientConfig) {
    this.fetchImpl = config.fetchImpl ?? fetch
    this.stateTtl = config.stateTtlMs ?? DEFAULT_STATE_TTL
    this.leewaySec = config.leewaySec ?? DEFAULT_LEEWAY_SEC
  }

  /** 生成 authorize URL（state 入 kv），returnTo 编码进 state 关联存储 */
  async authorizeUrl(returnTo?: string): Promise<string> {
    const state = randomToken(16)
    await this.config.stateKv.set(state, returnTo ?? '/', this.stateTtl)
    const url = new URL(this.config.endpoints.authorizeUrl)
    url.searchParams.append('client_id', this.config.clientId)
    url.searchParams.append('redirect_uri', this.config.redirectUri)
    url.searchParams.append('response_type', 'code')
    const scopes = this.config.scopes ?? ['openid']
    if (scopes.length) url.searchParams.append('scope', scopes.join(' '))
    url.searchParams.append('state', state)
    for (const [k, v] of Object.entries(this.config.authorizeExtraParams ?? {})) {
      url.searchParams.append(k, v)
    }
    return url.toString()
  }

  /**
   * 回调：state 一次性消费校验 → code 换 token → id_token 验签
   *   → userinfo → sub 交叉核对 → mapUser
   * 返回 { user, returnTo, claims }，claims 为验签后的 id_token payload。
   */
  async callback(params: {
    code: string
    state?: string
  }): Promise<{ user: AuthUser; returnTo: string; claims: OidcClaims }> {
    if (!params.code) throw new OidcError('missing_code', '缺少 code')
    let returnTo = '/'
    if (params.state) {
      const stored = await this.config.stateKv.take(params.state)
      if (stored === null) throw new OidcError('invalid_state', 'state 无效或已过期')
      returnTo = stored
    } else if (!this.config.allowNoState) {
      throw new OidcError('invalid_state', '缺少 state（如需放行请显式 allowNoState: true，dev only）')
    }

    const token = await this.exchangeToken(params.code)
    if (!token.id_token) {
      throw new OidcError('missing_id_token', 'token 响应缺少 id_token（IdP 非 OIDC？）')
    }
    const claims = await this.verifyIdToken(token.id_token)

    const raw = await this.fetchUserinfo(token.access_token)
    let user: AuthUser
    try {
      user = this.config.mapUser(raw)
    } catch (e) {
      throw new OidcError('map_failed', `mapUser 失败: ${(e as Error).message}`)
    }
    if (user.sub !== claims.sub) {
      throw new OidcError(
        'sub_mismatch',
        `userinfo.sub=${user.sub} 与 id_token.sub=${claims.sub} 不一致（身份绑定失败，拒绝登录）`,
      )
    }
    return { user, returnTo, claims }
  }

  /** 内部：code 换 token（POST tokenUrl，form 编码） */
  protected async exchangeToken(code: string): Promise<OidcTokenResponse> {
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
      redirect_uri: this.config.redirectUri,
    })
    const res = await this.fetchImpl(this.config.endpoints.tokenUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    })
    if (!res.ok) {
      throw new OidcError('token_failed', `token 端点失败: ${res.status} ${await res.text()}`)
    }
    return (await res.json()) as OidcTokenResponse
  }

  /** 内部：id_token 验签（HS256，密钥=clientSecret）+ iss/aud/exp 校验 */
  protected async verifyIdToken(idToken: string): Promise<OidcClaims> {
    try {
      const { payload } = await jwtVerify(idToken, new TextEncoder().encode(this.config.clientSecret), {
        issuer: this.config.issuer,
        audience: this.config.clientId,
        algorithms: ['HS256'],
        clockTolerance: this.leewaySec,
      })
      if (typeof payload.sub !== 'string' || payload.sub.length === 0) {
        throw new Error('id_token 缺少 sub')
      }
      return payload as OidcClaims
    } catch (e) {
      throw new OidcError(
        'id_token_invalid',
        `id_token 验签失败: ${(e as Error).message}（检查 issuer/clientSecret 配置与 IdP 签名算法）`,
      )
    }
  }

  /** 内部：Bearer 拉 userinfo */
  protected async fetchUserinfo(accessToken: string): Promise<unknown> {
    const res = await this.fetchImpl(this.config.endpoints.userinfoUrl, {
      method: 'GET',
      headers: { authorization: `Bearer ${accessToken}` },
    })
    if (!res.ok) {
      throw new OidcError('userinfo_failed', `userinfo 端点失败: ${res.status} ${await res.text()}`)
    }
    return await res.json()
  }
}

/** 验签后的 id_token payload（本包只依赖标准 claims） */
export interface OidcClaims {
  iss: string
  sub: string
  aud: string | string[]
  exp: number
  iat: number
  name?: string
  picture?: string
  [key: string]: unknown
}
