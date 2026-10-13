import type { Hono } from 'hono'
import type { RuntimeTarget } from '@homurajs/core'

/**
 * 双形态运行时适配器——qw-pages 全部未知约定的单点收口。
 * 跨形态差异（trust proxy、静态服务、端口）全走 adapter，业务代码零 if-else。
 */
export interface RuntimeAdapter {
  target: RuntimeTarget
  start(app: Hono, opts: { port?: number; signal?: AbortSignal }): Promise<void>
  /** qw-pages 在网关后 → 信任 X-Forwarded-*（影响 cookie secure/redirect URL） */
  trustProxy(): boolean
  /** 默认 dist/client，可被 HOMURA_ASSETS_DIR 覆盖 */
  assetsDir(env: NodeJS.ProcessEnv): string
}
