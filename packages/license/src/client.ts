import { randomToken } from '@homura/core'
import {
  GENUINE_ENDPOINTS,
  type HeartbeatResponse,
  type LicenseStatus,
  type RegisterResponse,
} from './contract.js'
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
  /** 时间注入口（测试，ms epoch；缺省 Date.now） */
  now?: () => number
}

interface RuntimeState {
  licenseId?: string
  instanceKey: string
  status: LicenseStatus
  heartbeatIntervalSec: number
  graceSec: number
  /** 失联宽限截止（ms epoch）；心跳成功即重置 */
  graceDeadline: number | null
}

/**
 * 激活客户端：注册 → 按 server 下发间隔心跳（+抖动）。
 * 本地状态机：连续失联超 graceSec → 'grace'；server 明示 suspended → 'suspended'。
 * 网络失败不抛错、不改变已确认状态，仅推进宽限期计时（fail-open）。
 */
export class LicenseClient {
  private readonly cfg: Required<Pick<LicenseClientConfig, 'server' | 'productId' | 'appId'>> &
    LicenseClientConfig
  private state: RuntimeState | null = null
  private timer: ReturnType<typeof setTimeout> | null = null
  private stopped = false

  constructor(config: LicenseClientConfig) {
    this.cfg = config
  }

  async register(): Promise<RegisterResponse> {
    const instanceKey = await this.resolveInstanceKey()
    const resp = await this.fetchJson<RegisterResponse>(GENUINE_ENDPOINTS.register, {
      productId: this.cfg.productId,
      appId: this.cfg.appId,
      instanceKey,
      licenseKey: this.cfg.licenseKey,
    })
    this.state = {
      licenseId: resp.licenseId,
      instanceKey,
      status: resp.status,
      heartbeatIntervalSec: resp.heartbeatIntervalSec,
      graceSec: resp.graceSec,
      graceDeadline: this.now() + resp.graceSec * 1000,
    }
    await this.cfg.stateStore?.save({
      licenseId: resp.licenseId,
      instanceKey,
    })
    return resp
  }

  /** 启动心跳循环（+±10% 抖动）；网络失败走宽限期，不抛错 */
  startHeartbeat(opts?: { onError?(e: Error): void }): void {
    if (!this.state) throw new Error('先 register() 再 startHeartbeat()')
    this.stopped = false
    this.scheduleNext(this.state.heartbeatIntervalSec)
    void this.beatOnce().catch((e: Error) => opts?.onError?.(e))
    // 心跳循环同时承载 onError 回调
    this.onError = opts?.onError
  }

  private onError?: (e: Error) => void

  private scheduleNext(intervalSec: number): void {
    if (this.stopped) return
    const jitter = intervalSec * 1000 * (0.9 + Math.random() * 0.2)
    this.timer = setTimeout(() => {
      void this.beatOnce()
        .catch((e: Error) => this.onError?.(e))
        .finally(() => {
          if (this.state) this.scheduleNext(this.state.heartbeatIntervalSec)
        })
    }, jitter)
  }

  private async beatOnce(): Promise<void> {
    if (!this.state?.licenseId) return
    try {
      const resp = await this.fetchJson<HeartbeatResponse>(GENUINE_ENDPOINTS.heartbeat, {
        licenseId: this.state.licenseId,
        instanceKey: this.state.instanceKey,
      })
      this.state.status = resp.status
      this.state.heartbeatIntervalSec = resp.heartbeatIntervalSec
      // 心跳成功：重置宽限
      this.state.graceDeadline = this.now() + this.state.graceSec * 1000
    } catch {
      // 网络失败：不改变确认状态，宽限期由 getStatus 动态判定
    }
  }

  stop(): void {
    this.stopped = true
    if (this.timer !== null) clearTimeout(this.timer)
    this.timer = null
  }

  getStatus(): LicenseStatus {
    if (!this.state) return 'unknown'
    if (this.state.status === 'suspended') return 'suspended'
    if (
      this.state.graceDeadline !== null &&
      this.now() > this.state.graceDeadline
    ) {
      return 'grace'
    }
    return this.state.status
  }

  private now(): number {
    return this.cfg.now?.() ?? Date.now()
  }

  private async resolveInstanceKey(): Promise<string> {
    if (this.cfg.instanceKey) return this.cfg.instanceKey
    const saved = await this.cfg.stateStore?.load()
    if (saved?.instanceKey) return saved.instanceKey
    return randomToken(16)
  }

  private async fetchJson<T>(path: string, body: Record<string, unknown>): Promise<T> {
    const fetchImpl = this.cfg.fetchImpl ?? fetch
    const base = this.cfg.server.replace(/\/$/, '')
    const res = await fetchImpl(`${base}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) throw new Error(`genuine ${path} -> ${res.status}`)
    return (await res.json()) as T
  }
}
