/**
 * 企业 access_token 管理（修复 Suzuran 每次调用重取无缓存的债）：
 * 7200s 有效期缓存 + 提前 300s 刷新 + 并发 single-flight + 主动失效。
 * 端点：GET https://oapi.dingtalk.com/gettoken?appkey=&appsecret=
 *
 * access_token 格式：32 位 hex，7200s 有效期（钉钉旧版 oapi 端点）。
 */
export interface CorpTokenManagerConfig {
  appKey: string
  appSecret: string
  fetchImpl?: typeof fetch
  /** 时间注入口（测试；ms epoch，缺省 Date.now） */
  now?: () => number
}

interface TokenCache {
  accessToken: string
  expiresAt: number // ms epoch
}

const REFRESH_MARGIN_MS = 300_000 // 提前 5 分钟刷新

export class CorpTokenManager {
  private cache: TokenCache | null = null
  /** single-flight：同时刻多次调用共享同一个 pending promise */
  private pending: Promise<string> | null = null

  constructor(private cfg: CorpTokenManagerConfig) {}

  /** 缓存命中直接返回（含提前刷新逻辑）；临期/失效时 single-flight 刷新 */
  async getAccessToken(): Promise<string> {
    const now = this.cfg.now?.() ?? Date.now()
    // 缓存未到期（含提前 5 分钟缓冲区）→ 直接返回
    if (this.cache && this.cache.expiresAt - REFRESH_MARGIN_MS > now) {
      return this.cache.accessToken
    }
    // single-flight：有进行中的刷新就等它
    if (this.pending) return this.pending
    this.pending = this.refresh().then(
      (t) => {
        this.pending = null
        return t
      },
      (e: unknown) => {
        this.pending = null
        // 刷新失败但旧 token 仍在劫期内（提前 5min 刷但还有 5min buffer）→ 返回旧 token
        if (this.cache && this.cache.expiresAt > now) return this.cache.accessToken
        throw e
      },
    )
    return this.pending
  }

  private async refresh(): Promise<string> {
    const fetchImpl = this.cfg.fetchImpl ?? fetch
    const url = `https://oapi.dingtalk.com/gettoken?appkey=${encodeURIComponent(this.cfg.appKey)}&appsecret=${encodeURIComponent(this.cfg.appSecret)}`
    const res = await fetchImpl(url, { method: 'GET' })
    const body = (await res.json()) as { errcode?: number; errmsg?: string; access_token?: string; expires_in?: number }
    if (body.errcode !== undefined && body.errcode !== 0) {
      throw new Error(`钉钉 gettoken 失败: ${body.errcode} ${body.errmsg ?? ''}`)
    }
    if (!body.access_token) {
      throw new Error(`钉钉 gettoken 响应缺少 access_token`)
    }
    const expiresInSec = body.expires_in ?? 7200
    this.cache = {
      accessToken: body.access_token,
      expiresAt: (this.cfg.now?.() ?? Date.now()) + expiresInSec * 1000,
    }
    return body.access_token
  }

  /** 收到 token 失效 errcode 后主动作废（下次调用强制刷新） */
  invalidate(): void {
    this.cache = null
  }
}