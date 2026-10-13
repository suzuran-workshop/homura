import { randomToken } from '@homurajs/core'
import {
  GENUINE_ENDPOINTS,
  isEntitlementExpired,
  verifyEntitlement,
  type Enforcement,
  type HeartbeatResponse,
  type LicenseEntitlement,
  type LicenseStatus,
  type RegisterResponse,
  type SignedEntitlement,
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
  /**
   * 中心的 Ed25519 公钥 PEM（配 `GENUINE_PUBLIC_KEY`）。
   * 配了才验签；生产必配——否则中心响应可被中间人改成 active。
   */
  publicKey?: string
  /**
   * 验签失败（篡改 / 密钥不符 / 授权属于别的实例）时的处置：
   * - `suspend`（缺省）：状态视为 suspended，且处置强度取最严 `all`、features 一律不采信
   * - `ignore`：**仅调试用**。状态与处置强度按未验签的响应走（即篡改者可自选处置强度），
   *   但 features 仍然永不采信。生产禁用此档。
   */
  onInvalidSignature?: 'suspend' | 'ignore'
}

/** 签名校验结果的四态：区分「中心没下发」与「下发了但验不过」，二者处置不同 */
export type SignatureState =
  | { kind: 'absent' }
  | { kind: 'unverified'; reason: string }
  | { kind: 'invalid'; reason: string }
  | { kind: 'verified' }

interface RuntimeState {
  licenseId?: string
  instanceKey: string
  status: LicenseStatus
  heartbeatIntervalSec: number
  graceSec: number
  /** 失联宽限截止（ms epoch）；心跳成功即重置 */
  graceDeadline: number | null
  /** 已验签的授权载荷；旧版中心不下发时为 null */
  entitlement: LicenseEntitlement | null
  signature: SignatureState
  /** 中心时间 - 本地时间（ms）；用于到期判定抗本地时钟回拨 */
  serverSkewMs: number
}

/**
 * 激活客户端：注册 → 按 server 下发间隔心跳（+抖动）。
 *
 * 本地状态机（优先级从高到低，见 getStatus）：
 * 1. 未注册 → `unknown`
 * 2. 验签失败（配了公钥且策略为 suspend）→ `suspended`
 * 3. 中心明示 suspended → `suspended`
 * 4. **本地判定已到期** → `expired`（不等心跳：需求是「只要发现过期就处置」；
 *    用中心下发的 serverTime 校正偏差，防用户回拨系统时间绕过）
 * 5. 连续失联超 graceSec → `grace`（fail-open，见 ADR-011）
 * 6. 否则用中心下发的状态
 *
 * 网络失败不抛错、不改变已确认状态，仅推进宽限期计时。
 */
export class LicenseClient {
  private readonly cfg: LicenseClientConfig
  private state: RuntimeState | null = null
  private timer: ReturnType<typeof setTimeout> | null = null
  private stopped = false
  private onError?: (e: Error) => void

  constructor(config: LicenseClientConfig) {
    this.cfg = config
  }

  async register(): Promise<RegisterResponse> {
    const instanceKey = await this.resolveInstanceKey()
    const now = this.now()
    const resp = await this.fetchJson<RegisterResponse>(GENUINE_ENDPOINTS.register, {
      productId: this.cfg.productId,
      appId: this.cfg.appId,
      instanceKey,
      licenseKey: this.cfg.licenseKey,
    })
    const adopted = this.adopt(resp.license, instanceKey, now)
    this.state = {
      licenseId: resp.licenseId,
      instanceKey,
      status: adopted.status ?? resp.status,
      heartbeatIntervalSec: resp.heartbeatIntervalSec,
      graceSec: resp.graceSec,
      graceDeadline: now + resp.graceSec * 1000,
      entitlement: adopted.entitlement,
      signature: adopted.signature,
      serverSkewMs: adopted.serverSkewMs,
    }
    await this.cfg.stateStore?.save({ licenseId: resp.licenseId, instanceKey })
    return resp
  }

  /** 启动心跳循环（+±10% 抖动）；网络失败走宽限期，不抛错 */
  startHeartbeat(opts?: { onError?(e: Error): void }): void {
    if (!this.state) throw new Error('先 register() 再 startHeartbeat()')
    this.stopped = false
    this.scheduleNext(this.state.heartbeatIntervalSec)
    void this.beatOnce().catch((e: Error) => opts?.onError?.(e))
    this.onError = opts?.onError
  }

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
      const now = this.now()
      const resp = await this.fetchJson<HeartbeatResponse>(GENUINE_ENDPOINTS.heartbeat, {
        licenseId: this.state.licenseId,
        instanceKey: this.state.instanceKey,
      })
      const adopted = this.adopt(resp.license, this.state.instanceKey, now)
      this.state.status = adopted.status ?? resp.status
      this.state.heartbeatIntervalSec = resp.heartbeatIntervalSec
      if (adopted.entitlement) this.state.entitlement = adopted.entitlement
      this.state.signature = adopted.signature
      this.state.serverSkewMs = adopted.serverSkewMs
      // 心跳成功：重置宽限
      this.state.graceDeadline = now + this.state.graceSec * 1000
    } catch {
      // 网络失败：不改变确认状态，宽限期由 getStatus 动态判定
    }
  }

  /**
   * 采信一份签名授权：验签 → 校验实例绑定 → 计算时钟偏差。
   * 返回的 status 为 null 表示「无法采信签名，请退回响应里的标量 status」。
   */
  private adopt(
    signed: SignedEntitlement | undefined,
    instanceKey: string,
    now: number,
  ): {
    entitlement: LicenseEntitlement | null
    signature: SignatureState
    serverSkewMs: number
    status: LicenseStatus | null
  } {
    if (!signed) {
      return {
        entitlement: null,
        signature: { kind: 'absent' },
        serverSkewMs: 0,
        status: null,
      }
    }
    const publicKey = this.cfg.publicKey
    if (!publicKey) {
      return {
        entitlement: signed.entitlement,
        signature: {
          kind: 'unverified',
          reason: '未配置 GENUINE_PUBLIC_KEY，无法验签（生产必配）',
        },
        serverSkewMs: skewOf(signed.entitlement.serverTime, now),
        status: null, // 不采信签名里的状态，退回标量字段
      }
    }
    const result = verifyEntitlement(signed, publicKey)
    if (!result.ok) {
      return {
        entitlement: signed.entitlement,
        signature: { kind: 'invalid', reason: result.reason },
        serverSkewMs: 0,
        status: this.cfg.onInvalidSignature === 'ignore' ? null : 'suspended',
      }
    }
    const ent = signed.entitlement
    if (ent.instanceKey !== instanceKey) {
      // 签名有效但不是发给这个实例的 → 授权被复制/重放
      return {
        entitlement: ent,
        signature: {
          kind: 'invalid',
          reason: `授权绑定的实例不符（响应 ${ent.instanceKey}，本机 ${instanceKey}）：同一份授权不能用于多个部署`,
        },
        serverSkewMs: skewOf(ent.serverTime, now),
        status: this.cfg.onInvalidSignature === 'ignore' ? null : 'suspended',
      }
    }
    return {
      entitlement: ent,
      signature: { kind: 'verified' },
      serverSkewMs: skewOf(ent.serverTime, now),
      status: ent.status,
    }
  }

  stop(): void {
    this.stopped = true
    if (this.timer !== null) clearTimeout(this.timer)
    this.timer = null
  }

  getStatus(): LicenseStatus {
    if (!this.state) return 'unknown'
    const sig = this.state.signature
    if (sig.kind === 'invalid' && this.cfg.onInvalidSignature !== 'ignore') return 'suspended'
    if (this.state.status === 'suspended') return 'suspended'
    // 本地到期判定（不等心跳）：中心下发的 expiresAt + 时钟偏差校正
    const ent = this.state.entitlement
    if (ent && sig.kind !== 'invalid') {
      if (ent.status === 'expired') return 'expired'
      if (isEntitlementExpired(ent, this.now(), this.state.serverSkewMs)) return 'expired'
    }
    if (this.state.graceDeadline !== null && this.now() > this.state.graceDeadline) return 'grace'
    return this.state.status
  }

  /** 已采信的授权载荷（功能范围、到期、处置强度、提醒文案）；未注册或旧版中心为 null */
  getEntitlement(): LicenseEntitlement | null {
    return this.state?.entitlement ?? null
  }

  /**
   * **只有验签通过**的授权才可用于处置决策。
   * 验签失败时载荷里的 enforcement / features / notice 全部不可信——否则篡改者
   * 可以自己把 enforcement 改成 'none'、把 features 塞满，等于绕过整个授权。
   */
  private trustedEntitlement(): LicenseEntitlement | null {
    return this.state?.signature.kind === 'verified' ? this.state.entitlement : null
  }

  /** 验签状态（供启动日志与健康检查暴露；`invalid` 意味着响应被篡改或密钥不符） */
  getSignatureState(): SignatureState {
    return this.state?.signature ?? { kind: 'absent' }
  }

  /** 是否被授予某项功能范围（授权不可信或缺失时一律 false，即默认拒绝） */
  hasFeature(feature: string): boolean {
    return this.trustedEntitlement()?.features.includes(feature) ?? false
  }

  /** 当前处置强度：active 时恒为 none；授权不可信时取最严（all） */
  getEnforcement(): Enforcement {
    const status = this.getStatus()
    if (status === 'active') return 'none'
    if (status === 'unknown' || status === 'grace') return 'none' // fail-open（ADR-011）
    return this.trustedEntitlement()?.enforcement ?? 'all'
  }

  /**
   * 强提醒文案。
   * - 授权不可信（验签失败）→ 固定的安全告警，不采信载荷里的文案
   * - 非 active → 保证非空（中心没填就自动生成）
   * - active → 只透传中心**显式**写的文案（到期前预警等运营通知），没有则 null
   */
  getNotice(): string | null {
    const status = this.getStatus()
    if (status === 'unknown') return null
    const sig = this.state?.signature
    if (sig?.kind === 'invalid') {
      return `授权校验失败（${sig.reason}）。为安全起见已停用全部功能，请联系供应方。`
    }
    const notice = this.trustedEntitlement()?.notice
    if (notice) return notice
    if (status === 'active') return null
    if (status === 'grace') return '与授权中心失联，正在宽限期内运行。'
    if (status === 'expired') return '本应用的授权已到期，部分或全部功能已受限。请联系供应方续期。'
    return '本应用已被供应方停用，请联系供应方了解详情。'
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

/** 中心时间 - 本地时间；解析失败按 0（不因格式问题误判到期） */
function skewOf(serverTime: string, localNow: number): number {
  const t = Date.parse(serverTime)
  return Number.isNaN(t) ? 0 : t - localNow
}
