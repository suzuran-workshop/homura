import { randomToken } from '@homura/core'
import type { TtlKv } from '@homura/core'
import type { AuthUser, OAuth2Endpoints, TokenResponse } from '../types.js'

export interface OAuth2ClientConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  scopes?: string[]
  endpoints: OAuth2Endpoints
  /** 上游原始 userinfo → 规范身份（预设来自 @homura/3p/*） */
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
}

const DEFAULT_STATE_TTL = 5 * 60_000

/**
 * 通用标准 OAuth2 (Authorization Code Flow) 客户端。
 * 服务端（如 ../oauth2-dingtalk）由 3p 预设注入，本类不感知具体 IdP。
 */
export class OAuth2Client {
  private fetchImpl: typeof fetch
  private stateTtl: number

  constructor(private config: OAuth2ClientConfig) {
    this.fetchImpl = config.fetchImpl ?? fetch
    this.stateTtl = config.stateTtlMs ?? DEFAULT_STATE_TTL
  }

  /** 生成 authorize URL（state 入 kv），returnTo 编码进 state 关联存储 */
  async authorizeUrl(returnTo?: string): Promise<string> {
    const state = randomToken(16)
    await this.config.stateKv.set(state, returnTo ?? '/', this.stateTtl)
    const url = new URL(this.config.endpoints.authorizeUrl)
    url.searchParams.append('client_id', this.config.clientId)
    url.searchParams.append('redirect_uri', this.config.redirectUri)
    url.searchParams.append('response_type', 'code')
    if (this.config.scopes?.length) {
      url.searchParams.append('scope', this.config.scopes.join(' '))
    }
    url.searchParams.append('state', state)
    for (const [k, v] of Object.entries(this.config.authorizeExtraParams ?? {})) {
      url.searchParams.append(k, v)
    }
    return url.toString()
  }

  /**
   * 回调：state 一次性消费校验 → code 换 token → 拉 userinfo → mapUser
   * 返回 { user, returnTo }，供 hono 路由建 session 后跳转
   */
  async callback(params: { code: string; state?: string }): Promise<{ user: AuthUser; returnTo: string }> {
    if (!params.code) throw new Error('缺少 code')
    let returnTo = '/'
    if (params.state) {
      const stored = await this.config.stateKv.take(params.state)
      if (stored === null) throw new Error('state 无效或已过期')
      returnTo = stored
    } else if (!this.config.allowNoState) {
      throw new Error('缺少 state（如需放行请显式 allowNoState: true，dev only）')
    }
    const token = await this.exchangeToken(params.code)
    const raw = await this.fetchUserinfo(token.access_token)
    const user = this.config.mapUser(raw)
    return { user, returnTo }
  }

  /** 内部：code 换 token（POST tokenUrl，form 编码） */
  protected async exchangeToken(code: string): Promise<TokenResponse> {
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
      throw new Error(`token 端点失败: ${res.status} ${await res.text()}`)
    }
    return (await res.json()) as TokenResponse
  }

  /** 内部：Bearer 拉 userinfo */
  protected async fetchUserinfo(accessToken: string): Promise<unknown> {
    const res = await this.fetchImpl(this.config.endpoints.userinfoUrl, {
      method: 'GET',
      headers: { authorization: `Bearer ${accessToken}` },
    })
    if (!res.ok) {
      throw new Error(`userinfo 端点失败: ${res.status} ${await res.text()}`)
    }
    return await res.json()
  }
}
