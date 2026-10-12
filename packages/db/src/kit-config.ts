/**
 * drizzle-kit 配置工厂：App 的 drizzle.pg.config.ts / drizzle.sqlite.config.ts 各调一次。
 */
export interface DrizzleKitOptions {
  dialect: 'pg' | 'sqlite'
  /** schema 文件 glob，如 './src/server/schema/pg.ts' */
  schemaGlob: string
  /** 迁移输出目录，如 './drizzle/pg' */
  out: string
}

export function defineDrizzleKitConfig(opts: DrizzleKitOptions): Record<string, unknown> {
  throw new Error(`NotImplemented: defineDrizzleKitConfig(${opts.dialect})`)
}
