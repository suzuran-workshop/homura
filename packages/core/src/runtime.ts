/**
 * 运行环境探测 + 形态相关的运行时常量。
 *
 * 显式配置（HOMURA_RUNTIME）永远优先；探测仅为零配置体验的缺省，
 * 标记列表集中在 QW_PAGES_ENV_MARKERS，属启发式，可被显式值覆盖。
 *
 * 标记来源：2026-10-13 在真实 qw-pages 动态页上实测（线上探针回读 process.env 全集）。
 * 平台注入集只有 12 个变量：PORT / HOST / NODE_ENV / HOME / TMPDIR / XDG_* /
 * QWENWORK_WRITABLE_DIR / SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_INSTANCE_ID。
 * 不存在任何 QW_PAGES* 命名的变量——旧标记 ['QW_PAGES','QW_PAGES_APP_ID'] 已证伪移除，
 * 定论见 docs/specs/module-qw-pages.md 第 5 项。
 */
export type RuntimeTarget = 'standalone' | 'qw-pages'

export interface RuntimeInfo {
  target: RuntimeTarget
  /** true = 来自显式 env；false = 启发式探测 */
  explicit: boolean
  /** 探测依据（explicit=false 时给出命中的标记） */
  reasons: string[]
}

/**
 * qw-pages 环境的启发式标记（实测注入，可被 HOMURA_RUNTIME 覆盖）。
 * - QWENWORK_WRITABLE_DIR：平台必注入的唯一可写目录（实测 /tmp/qwenwork-page，跨发布清空）
 * - SUPABASE_INSTANCE_ID：仅在 Page 绑定数据库后注入，故只作辅助标记
 * 不纳入 HOST/PORT：standalone 部署也常设这两个变量，会造成误判。
 */
export const QW_PAGES_ENV_MARKERS: readonly string[] = [
  'QWENWORK_WRITABLE_DIR',
  'SUPABASE_INSTANCE_ID',
]

/**
 * 健康检查路径按形态取值——同源常量：app-kit 注册路由、license guard 豁免清单、
 * 模板 SPA fallback 的保留前缀都读它，避免三处各写一份而漂移。
 *
 * qw-pages 上 '/healthz' 被 Page Gateway 保留：实测网关自答 `ok`（text/plain），
 * 请求不下发到 App 进程（探针 serve 计数不增），因此 App 注册在 '/healthz'
 * 的检查项在 Pages 上永远不可达。
 */
export const HEALTHZ_PATH: Readonly<Record<RuntimeTarget, string>> = {
  standalone: '/healthz',
  'qw-pages': '/_healthz',
}

/** 取指定形态的健康检查路径 */
export function healthzPathFor(target: RuntimeTarget): string {
  return HEALTHZ_PATH[target]
}

export function detectRuntime(env: NodeJS.ProcessEnv): RuntimeInfo {
  const explicit = env['HOMURA_RUNTIME']
  if (explicit !== undefined) {
    if (explicit !== 'standalone' && explicit !== 'qw-pages') {
      throw new Error(`HOMURA_RUNTIME 非法值: ${explicit}（允许 'standalone' | 'qw-pages'）`)
    }
    return { target: explicit, explicit: true, reasons: [`HOMURA_RUNTIME=${explicit}`] }
  }
  const hits = QW_PAGES_ENV_MARKERS.filter((m) => env[m] !== undefined && env[m] !== '')
  if (hits.length > 0) {
    return { target: 'qw-pages', explicit: false, reasons: hits }
  }
  return { target: 'standalone', explicit: false, reasons: [] }
}
