/**
 * WebAuthn 凭证仓储接口。
 * Drizzle 双方言（pg/sqlite）实现共享此接口。
 *
 * WebAuthnCredentialRecord 字段与 tables.ts 的 webauthn_credentials 对齐：
 *   id(credentialId) / user_id / public_key / counter / device_type / backed_up / transports / display_name / created_at
 */
import type { WebauthnCredentialRecord } from '../identity/types.js'

export interface WebauthnCredentialStore {
  /** 按 credentialId 查；不存在返回 null */
  findById(id: string): Promise<WebauthnCredentialRecord | null>
  /** 按 userId 查所有凭证 */
  findByUserId(userId: string): Promise<WebauthnCredentialRecord[]>
  /** 创建凭证 */
  create(input: {
    id: string
    userId: string
    publicKey: string
    counter: number
    deviceType: string
    backedUp: number
    transports?: string | null
    displayName?: string | null
  }): Promise<WebauthnCredentialRecord>
  /** 更新 counter（验证成功后调用） */
  updateCounter(id: string, counter: number): Promise<void>
  /** 删除凭证 */
  delete(id: string): Promise<void>
}
