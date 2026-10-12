/** refresh_tokens 表记录（store 实现与迁移共用）；时间用 epoch 毫秒（原生 SQL 双方言一致） */
export interface RefreshTokenRecord {
  /** SHA-256 hex */
  tokenHash: string
  familyId: string
  sid: string
  sub: string
  /** epoch ms */
  expiresAt: number
  /** JSON 字符串 { nickname?, avatarUrl? }，rotate 时回填 access token */
  profile?: string | null
}

/** consume 结果：revoked=true 表示该 token 此前已被消费（复用信号 → 触发族吊销） */
export interface ConsumedToken {
  familyId: string
  sid: string
  sub: string
  profile?: string | null
  revoked: boolean
}
