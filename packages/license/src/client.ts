import type { LicenseStatus } from './contract.js'
import type { LicenseStateStore } from './state-store.js'

export interface LicenseClientConfig {
  /** homura-genuine base URL */
  server: string
  productId: string
  appId: string
  licenseKey?: string
  /** 缺省由 state store 生成并持久化 */
  instanceKey?: string
  stateStore?: LicenseStateStore
  fetchImpl?: typeof fetch
  /** 时间注入口（测试） */
  now?: () => number
}

/**
 * 激活客户端：注册 → 按 server 下发间隔心跳（+抖动）。
 * 本地状态机：连续失败超 graceSec → 'grace'；server 明示 suspended → 'suspended'。
 */
export class LicenseClient {
  constructor(_config: LicenseClientConfig) {}

  async register(): Promise<import('./contract.js').RegisterResponse> {
    throw new Error('NotImplemented: LicenseClient.register')
  }

  /** 启动心跳循环；网络失败不改变状态，走宽限期计时 */
  startHeartbeat(opts?: { onError?(e: Error): void }): void {
    throw new Error('NotImplemented: LicenseClient.startHeartbeat')
  }

  stop(): void {
    throw new Error('NotImplemented: LicenseClient.stop')
  }

  getStatus(): LicenseStatus {
    throw new Error('NotImplemented: LicenseClient.getStatus')
  }
}
