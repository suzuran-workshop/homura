import type { NodeSQLiteDatabase } from 'drizzle-orm/node-sqlite'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import type { RefreshTokenRecord } from './record.js'

/** 双方言数据库实例（与 @homura/db 的 Database 结构一致，但保持本包 peer 边界独立） */
export type DrizzleDb = PostgresJsDatabase<Record<string, never>> | NodeSQLiteDatabase<Record<string, never>>

export interface RefreshTokenStore {
  create(r: RefreshTokenRecord): Promise<void>
  consume(tokenHash: string): Promise<
    | (Pick<RefreshTokenRecord, 'familyId' | 'sid' | 'sub'> & { revoked: boolean })
    | null
  >
  revokeFamily(familyId: string): Promise<void>
  revokeUser(sub: string): Promise<void>
}

/** drizzle 双方言实现（表定义见 @homura/auth/tables） */
export function createDrizzleSessionStore(db: DrizzleDb): RefreshTokenStore {
  throw new Error('NotImplemented: createDrizzleSessionStore')
}
