/**
 * qw-pages 适配器：不监听端口；exportHandlers 同时给 default/fetch/app
 * 三种导出形态（对冲 qw-pages 入口约定未知）。
 * 静态资源相对 import.meta.url 定位——自包含 bundle 下 server 产物与 client assets 同级，
 * 故从当前模块 URL 回溯到 dist/ 再进 client/（可被 HOMURA_ASSETS_DIR 覆盖）。
 */
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import type { Hono } from 'hono'
import type { RuntimeAdapter } from './adapter.js'

export interface ExportHandlers {
  /** qw-pages 入口约定未知的三重对冲：default / fetch / app 同时导出 */
  default: (req: Request) => Promise<Response>
  fetch: (req: Request) => Promise<Response>
  app: Hono
}

export function createQwPagesAdapter(): RuntimeAdapter {
  return {
    target: 'qw-pages',
    async start() {
      // qw-pages 平台负责调用 fetch handler，不自行监听端口。
      // 若被误当 standalone 启动，给出明确指引而非静默挂起。
      throw new Error(
        'qw-pages 形态不监听端口：请用 exportHandlers(app) 导出 default/fetch/app，由平台调用',
      )
    },
    // qw-pages 在平台网关后 → 信任 X-Forwarded-*（影响 cookie secure/redirect URL）
    trustProxy: () => true,
    assetsDir: (env) => {
      if (env.HOMURA_ASSETS_DIR) return resolve(env.HOMURA_ASSETS_DIR)
      // 自包含 bundle：dist/server/index.mjs → 回溯 dist/ → dist/client
      const here = dirname(fileURLToPath(import.meta.url))
      return resolve(here, '../client')
    },
  }
}

/** 三重导出对冲：default / fetch / app 同时给，覆盖 qw-pages 未知入口约定 */
export function exportHandlers(app: Hono): ExportHandlers {
  const handler = (req: Request): Promise<Response> => Promise.resolve(app.fetch(req))
  return { default: handler, fetch: handler, app }
}
