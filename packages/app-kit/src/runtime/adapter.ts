import type { Hono } from 'hono'

/**
 * 运行时适配器——部署差异的单点收口（监听端口/HOST 缺省、trust proxy、静态资源目录），
 * 业务代码零 if-else。adapter 只负责监听，静态资源由 createApp 的 staticDir 挂载。
 */
export interface RuntimeAdapter {
  start(app: Hono, opts: { port?: number; signal?: AbortSignal }): Promise<void>
  /**
   * 是否在反向代理后（决定 cookie secure 与 X-Forwarded-* 可信度）。
   * 消费方：模板把它接到 @homurajs/auth 的 `secure` 选项上。
   */
  trustProxy(): boolean
  /** 静态资源目录：默认 dist/client，可被 HOMURA_ASSETS_DIR 覆盖 */
  assetsDir(env: NodeJS.ProcessEnv): string
}
