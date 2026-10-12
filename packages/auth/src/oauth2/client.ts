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
}

/**
 * 通用标准 OAuth2 (Authorization Code Flow) 客户端。
 * 服务端（如 ../oauth2-dingtalk）由 3p 预设注入，本类不感知具体 IdP。
 */
export class OAuth2Client {
  constructor(_config: OAuth2ClientConfig) {}

  /** 生成 authorize URL（state 入 kv），returnTo 编码进 state 关联存储 */
  async authorizeUrl(_returnTo?: string): Promise<string> {
    throw new Error('NotImplemented: OAuth2Client.authorizeUrl')
  }

  /** 回调：state 一次性消费校验 → code 换 token → 拉 userinfo → mapUser */
  async callback(_params: { code: string; state?: string }): Promise<AuthUser> {
    throw new Error('NotImplemented: OAuth2Client.callback')
  }

  /** 内部：code 换 token（POST tokenUrl，form 编码） */
  protected async exchangeToken(_code: string): Promise<TokenResponse> {
    throw new Error('NotImplemented: OAuth2Client.exchangeToken')
  }

  /** 内部：Bearer 拉 userinfo */
  protected async fetchUserinfo(_accessToken: string): Promise<unknown> {
    throw new Error('NotImplemented: OAuth2Client.fetchUserinfo')
  }
}
