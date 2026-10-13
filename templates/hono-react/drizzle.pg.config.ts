/**
 * PG 方言迁移生成配置（supabase/pgsql 共用）。
 * 用法：pnpm db:generate（内部调 drizzle-kit generate --config=drizzle.pg.config.ts）
 */
import { defineDrizzleKitConfig } from '@homurajs/db'

export default defineDrizzleKitConfig({
  dialect: 'pg',
  schemaGlob: './src/server/schema/pg.ts',
  out: './drizzle/pg',
})
