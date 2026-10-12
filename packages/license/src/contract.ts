/**
 * 与 homura-genuine（../homura-genuine）的唯一契约事实源。
 * homura-genuine 建库时逐字同步此文件。
 * ⚠ 全部端点为契约草案，实现若有出入，改此文件 + 双方同步。
 */

export const GENUINE_API_VERSION = 'v1'

export type LicenseStatus = 'unknown' | 'active' | 'grace' | 'suspended'

export interface RegisterRequest {
  productId: string
  appId: string
  instanceKey: string
  licenseKey?: string
  version?: string
  fingerprint?: Record<string, string>
}

export interface RegisterResponse {
  licenseId: string
  status: LicenseStatus
  /** server 下发的心跳间隔（秒） */
  heartbeatIntervalSec: number
  /** 网络失联宽限期（秒） */
  graceSec: number
  issuedAt: string
}

export interface HeartbeatRequest {
  licenseId: string
  instanceKey: string
  metrics?: {
    activeUsers?: number
    reqPerMin?: number
  }
}

export interface HeartbeatResponse {
  status: LicenseStatus
  heartbeatIntervalSec: number
  serverTime: string
  /** 运营通知（如停服原因、联系方式） */
  notice?: string
}

/** 契约端点路径（相对 server base URL） */
export const GENUINE_ENDPOINTS = {
  register: `/${GENUINE_API_VERSION}/register`,
  heartbeat: `/${GENUINE_API_VERSION}/heartbeat`,
} as const
