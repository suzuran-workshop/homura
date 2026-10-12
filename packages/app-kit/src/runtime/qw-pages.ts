/**
 * qw-pages 适配器：不监听端口；exportHandlers 同时给 default/fetch/app
 * 三种导出形态（对冲 qw-pages 入口约定未知）。
 * 静态资源改为 app 内 serveStatic（import.meta.url 定位打包 assets——自包含 bundle 下可靠）。
 */
import type { Hono } from 'hono'
import type { RuntimeAdapter } from './adapter.js'

export interface ExportHandlers {
  /** qw-pages 入口约定未知的三重对冲：default / fetch / app 同时导出 */
  default: (req: Request) => Promise<Response>
  fetch: (req: Request) => Promise<Response>
  app: Hono
}

export function createQwPagesAdapter(): RuntimeAdapter {
  throw new Error('NotImplemented: createQwPagesAdapter')
}

export function exportHandlers(_app: Hono): ExportHandlers {
  throw new Error('NotImplemented: exportHandlers')
}
