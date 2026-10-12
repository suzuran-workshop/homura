/**
 * drizzle-kit 配置工厂：App 的 drizzle.pg.config.ts / drizzle.sqlite.config.ts 各调一次。
 * 返回值直接 export default 即可（kit 侧 jiti 加载，类型保持宽松）。
 */
export interface DrizzleKitOptions {
  dialect: 'pg' | 'sqlite'
  /** schema 文件 glob，如 './src/server/schema/pg.ts' */
  schemaGlob: string
  /** 迁移输出目录，如 './drizzle/pg' */
  out: string
}

/** 注意映射：drizzle-kit 的 pg 方言枚举是 'postgresql' */
export function defineDrizzleKitConfig(opts: DrizzleKitOptions): Record<string, unknown> {
  return {
    dialect: opts.dialect === 'pg' ? 'postgresql' : 'sqlite',
    schema: opts.schemaGlob,
    out: opts.out,
  }
}
