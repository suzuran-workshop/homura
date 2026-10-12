/**
 * 企业 access_token 管理（修复 Suzuran 每次调用重取无缓存的债）：
 * 7200s 有效期缓存 + 提前 300s 刷新 + 并发 single-flight + 主动失效。
 * 端点：GET https://oapi.dingtalk.com/gettoken?appkey=&appsecret=
 */
export interface CorpTokenManagerConfig {
  appKey: string
  appSecret: string
  fetchImpl?: typeof fetch
  /** 时间注入口（测试） */
  now?: () => number
}

export class CorpTokenManager {
  constructor(_config: CorpTokenManagerConfig) {}

  /** 缓存命中直接返回；临期/失效时 single-flight 刷新 */
  async getAccessToken(): Promise<string> {
    throw new Error('NotImplemented: CorpTokenManager.getAccessToken')
  }

  /** 收到 token 失效 errcode 后主动作废 */
  invalidate(): void {
    throw new Error('NotImplemented: CorpTokenManager.invalidate')
  }
}
