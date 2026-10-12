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
  const explicit = env['HOMURA_RUNTIME']
  if (explicit !== undefined) {
    if (explicit !== 'standalone' && explicit !== 'qw-pages') {
      throw new Error(
        `HOMURA_RUNTIME 非法值: ${explicit}（允许 'standalone' | 'qw-pages'）`,
      )
    }
    return { target: explicit, explicit: true, reasons: [`HOMURA_RUNTIME=${explicit}`] }
  }
  const hits = QW_PAGES_ENV_MARKERS.filter((m) => env[m] !== undefined && env[m] !== '')
  if (hits.length > 0) {
    return { target: 'qw-pages', explicit: false, reasons: hits }
  }
  return { target: 'standalone', explicit: false, reasons: [] }
}
