/**
 * 结构化日志（轻量零依赖实现）：JSON lines 输出，便于平台/网关收集。
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

const LEVEL_ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 }
const DEFAULT_REDACT = ['secret', 'password', 'token', 'authorization', 'apikey']

export interface Logger {
  debug(msg: string, fields?: Record<string, unknown>): void
  info(msg: string, fields?: Record<string, unknown>): void
  warn(msg: string, fields?: Record<string, unknown>): void
  error(msg: string, fields?: Record<string, unknown>): void
  /** 派生带固定 scope 的子 logger */
  child(scope: string): Logger
}

export function createLogger(options?: {
  level?: LogLevel
  /** 输出中打码的字段名（默认 ['secret','password','token','authorization','apikey']） */
  redactKeys?: string[]
}): Logger {
  const level = options?.level ?? 'info'
  const redactKeys = options?.redactKeys ?? DEFAULT_REDACT
  const redactSet = new Set(redactKeys.map((k) => k.toLowerCase()))

  const emit = (
    lvl: LogLevel,
    scopes: string[],
    msg: string,
    fields?: Record<string, unknown>,
  ): void => {
    if (LEVEL_ORDER[lvl] < LEVEL_ORDER[level]) return
    const safeFields: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(fields ?? {})) {
      safeFields[k] = redactSet.has(k.toLowerCase()) ? '[REDACTED]' : v
    }
    const line = {
      ts: new Date().toISOString(),
      level: lvl,
      ...(scopes.length > 0 ? { scope: scopes.join(':') } : {}),
      msg,
      ...safeFields,
    }
    const out = JSON.stringify(line)
    if (lvl === 'error') console.error(out)
    else if (lvl === 'warn') console.warn(out)
    else console.log(out)
  }

  const make = (scopes: string[]): Logger => ({
    debug: (m, f) => emit('debug', scopes, m, f),
    info: (m, f) => emit('info', scopes, m, f),
    warn: (m, f) => emit('warn', scopes, m, f),
    error: (m, f) => emit('error', scopes, m, f),
    child: (scope) => make([...scopes, scope]),
  })

  return make([])
}
