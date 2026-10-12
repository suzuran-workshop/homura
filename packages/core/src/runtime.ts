/**
 * 运行环境探测。
 *
 * 显式配置（HOMURA_RUNTIME）永远优先；探测仅为零配置体验的缺省，
 * 标记列表集中在 QW_PAGES_ENV_MARKERS，属启发式，可被显式值覆盖。
 */
export type RuntimeTarget = 'standalone' | 'qw-pages'

export interface RuntimeInfo {
  target: RuntimeTarget
  /** true = 来自显式 env；false = 启发式探测 */
  explicit: boolean
  /** 探测依据（explicit=false 时给出命中的标记） */
  reasons: string[]
}

/** qw-pages 环境的启发式标记（文档标注：启发式、可被 HOMURA_RUNTIME 覆盖） */
export const QW_PAGES_ENV_MARKERS: readonly string[] = ['QW_PAGES', 'QW_PAGES_APP_ID']

export function detectRuntime(env: NodeJS.ProcessEnv): RuntimeInfo {
  throw new Error('NotImplemented: detectRuntime')
}
