/**
 * 类型安全的配置装载：配置即文档。
 *
 * defineConfig(specs) 返回 { load, help }：
 * - load(env?) 解析并校验环境变量（未显式传 env 时自动 process.loadEnvFile()）
 * - help() 生成 .env.example 片段
 */
export interface ConfigSpec<T> {
  /** 环境变量名 */
  env: string
  default?: T
  parse: (raw: string) => T
  /** true = 缺失且无 default 即抛错 */
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
  const loadFrom = (env: NodeJS.ProcessEnv): Record<string, unknown> => {
    const out: Record<string, unknown> = {}
    for (const [key, spec] of Object.entries(specs)) {
      const raw = env[spec.env]
      if (raw !== undefined && raw !== '') {
        out[key] = spec.parse(raw)
      } else if (spec.default !== undefined) {
        out[key] = spec.default
      } else if (spec.required) {
        throw new Error(`缺少必需的环境变量 ${spec.env}（配置项 ${key}）`)
      } else {
        out[key] = undefined
      }
    }
    return out
  }

  return {
    load(env?: NodeJS.ProcessEnv): LoadedConfig<S> {
      let source = env
      if (!source) {
        // dev 便捷：自动读取 .env（不存在则忽略）
        try {
          process.loadEnvFile()
        } catch {
          /* no .env */
        }
        source = process.env
      }
      const resolved = loadFrom(source)
      return {
        get: ((key: string) => {
          if (!(key in resolved)) throw new Error(`未知配置项: ${key}`)
          return resolved[key]
        }) as LoadedConfig<S>['get'],
        raw: () => resolved as {
          [K in keyof S]: S[K] extends ConfigSpec<infer T> ? T | undefined : never
        },
      }
    },
    help(): string {
      const lines: string[] = ['# 由 @homurajs/core defineConfig 生成（配置即文档）', '']
      for (const [key, spec] of Object.entries(specs)) {
        if (spec.description) lines.push(`# ${spec.description}`)
        const example =
          spec.secret ? `${spec.env}=<redacted>` : `${spec.env}=${spec.default ?? ''}`
        lines.push(`${example}`)
        lines.push('')
        void key
      }
      return lines.join('\n')
    },
  }
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
