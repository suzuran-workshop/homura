/**
 * SQLite 方言迁移生成配置（node:sqlite 独立形态）。
 * 用法：pnpm db:generate（内部调 drizzle-kit generate --config=drizzle.sqlite.config.ts）
 */
import { defineDrizzleKitConfig } from '@homura/db'

export default defineDrizzleKitConfig({
  dialect: 'sqlite',
  schemaGlob: './src/server/schema/sqlite.ts',
  out: './drizzle/sqlite',
})
