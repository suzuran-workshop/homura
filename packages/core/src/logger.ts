/**
 * 结构化日志（轻量零依赖实现）。
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

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
  /** 输出中打码的字段名（默认 ['secret', 'password', 'token']） */
  redactKeys?: string[]
}): Logger {
  throw new Error('NotImplemented: createLogger')
}
