import { drizzle } from 'drizzle-orm/node-sqlite'
import { DatabaseSync } from 'node:sqlite'
import type { SqliteDbConfig } from './types.js'

/** node:sqlite 的 drizzle 实例类型 */
export type SqliteDatabase = ReturnType<typeof drizzle> & { $client: DatabaseSync }

/** node:sqlite driver（Node >= 22.5；无 flag 稳定运行以 24 为准） */
export function createSqliteDb(config: SqliteDbConfig): SqliteDatabase {
  const client = new DatabaseSync(config.path)
  return drizzle({ client })
}
