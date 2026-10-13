import type { Hono } from 'hono'
import type { RuntimeTarget } from '@homurajs/core'

/**
 * 双形态运行时适配器——跨形态差异的单点收口。
 * 差异项（监听端口/HOST 缺省、trust proxy、静态资源目录）全走 adapter，业务代码零 if-else。
 *
 * 注：qw-pages 的约定已于 2026-10-13 全部实测确认（见 runtime/qw-pages.ts 头部与
 * docs/specs/module-qw-pages.md），本接口不再是「对冲未知」，而是两形态真实差异的最小面。
 * 两个适配器都监听端口——平台形态差异只剩默认值，不存在「平台调用导出函数」的形态。
 */
export interface RuntimeAdapter {
  target: RuntimeTarget
  start(app: Hono, opts: { port?: number; signal?: AbortSignal }): Promise<void>
  /**
   * 是否在反向代理后（决定 cookie secure 与 X-Forwarded-* 可信度）。
   * qw-pages 恒为 true；standalone 由 TRUST_PROXY=1 开启。
   * 消费方：模板把它接到 @homurajs/auth 的 `secure` 选项上。
   */
  trustProxy(): boolean
  /** 静态资源目录：standalone 默认 dist/client，qw-pages 默认 client；均可被 HOMURA_ASSETS_DIR 覆盖 */
  assetsDir(env: NodeJS.ProcessEnv): string
}
