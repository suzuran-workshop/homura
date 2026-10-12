/** refresh_tokens 表记录（store 实现与迁移共用） */
export interface RefreshTokenRecord {
  /** SHA-256 hex */
  tokenHash: string
  familyId: string
  sid: string
  sub: string
  expiresAt: Date
  revokedAt?: Date | null
}
