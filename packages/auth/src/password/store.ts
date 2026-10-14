/**
 * 密码凭证仓储接口。
 * Drizzle 双方言与 PostgREST 两版实现共享此接口。
 * PasswordProvider 通过此接口操作 passwords 表，不直接依赖 DrizzleDb。
 */

export interface PasswordRecord {
  userId: string
  passwordHash: string
  createdAt: number
  updatedAt: number
}

export interface PasswordStore {
  /** 按 userId 查密码记录；不存在返回 null */
  findByUserId(userId: string): Promise<PasswordRecord | null>
  /** 创建密码记录（user_id 即 PK，1:1 约束） */
  create(input: { userId: string; passwordHash: string }): Promise<PasswordRecord>
  /** 更新密码哈希 */
  updateHash(userId: string, passwordHash: string): Promise<void>
  /** 删除密码记录 */
  delete(userId: string): Promise<void>
}
