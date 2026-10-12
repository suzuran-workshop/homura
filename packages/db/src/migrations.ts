/**
 * 迁移双轨运行时：按实例分发 drizzle 对应 migrator。
 * 生成侧用 defineDrizzleKitConfig（drizzle-kit generate）。
 */
import type { Database } from './types.js'

export function runMigrations(db: Database, folder: string): Promise<void> {
  throw new Error(`NotImplemented: runMigrations(${folder})`)
}
