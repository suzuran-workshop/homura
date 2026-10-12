/**
 * 类型安全的配置装载：配置即文档。
 *
 * defineConfig(specs) 返回 { load, help }：
 * - load(env?) 解析并校验环境变量（dev 下自动 process.loadEnvFile()）
 * - help() 生成 .env.example 片段
 */
export interface ConfigSpec<T> {
  /** 环境变量名 */
  env: string
  default?: T
  parse: (raw: string) => T
  /** true = 缺失即抛错 */
  required?: boolean
  /** true = help() 输出时打码 */
  secret?: boolean
  /** 人类可读说明（help() 输出与 .env.example 注释） */
  description?: string
}

export interface LoadedConfig<S extends Record<string, ConfigSpec<unknown>>> {
  /** 按 spec key 取已解析值 */
  get<K extends keyof S & string>(key: K): S[K] extends ConfigSpec<infer T> ? T : never
  /** 原始解析结果（测试用） */
  raw(): { [K in keyof S]: S[K] extends ConfigSpec<infer T> ? T | undefined : never }
}

export function defineConfig<S extends Record<string, ConfigSpec<unknown>>>(specs: S): {
  load(env?: NodeJS.ProcessEnv): LoadedConfig<S>
  /** 生成 .env.example 片段——配置即文档 */
  help(): string
} {
  throw new Error('NotImplemented: defineConfig')
}

/** 常用 parse 助手 */
export const parses = {
  string: (raw: string) => raw,
  int: (raw: string) => {
    const n = Number.parseInt(raw, 10)
    if (Number.isNaN(n)) throw new Error(`not an integer: ${raw}`)
    return n
  },
  boolean: (raw: string) => raw === '1' || raw.toLowerCase() === 'true',
} as const
