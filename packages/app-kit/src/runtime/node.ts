/**
 * standalone 适配器：@hono/node-server 端口监听。
 * 可选 peer：@hono/node-server（动态 import，不装也能 typecheck 其余部分）。
 * 静态资源由 createApp 的 staticDir 挂载（见 static.ts），adapter 只负责监听与 trust proxy。
 *
 * listenWithNodeServer 同时被 qw-pages 适配器复用：2026-10-13 线上实测确认，qw-pages 动态页
 * 与 standalone 一样是「平台拉起 node <entrypoint>，网关反代到 App 自监听的 socket」，
 * 并不存在 serverless fetch-handler 入口约定，故两形态共用同一套监听实现，只差端口/HOST 默认值。
 */
import { resolve } from 'node:path'
import type { Hono } from 'hono'
import type { RuntimeAdapter } from './adapter.js'

export interface ListenOptions {
  port?: number
  /** 缺省读 process.env.HOST，再缺省 0.0.0.0 */
  hostname?: string
  signal?: AbortSignal
}

/** 共享监听实现：读 PORT/HOST，支持 AbortSignal 优雅关闭 */
export async function listenWithNodeServer(app: Hono, opts: ListenOptions = {}): Promise<void> {
  const { serve } = await import('@hono/node-server')
  const port = opts.port ?? Number(process.env.PORT ?? 3000)
  const hostname = opts.hostname ?? process.env.HOST ?? '0.0.0.0'
  return new Promise<void>((resolveStart) => {
    const server = serve({ fetch: app.fetch, port, hostname }, () => {
      resolveStart()
    })
    opts.signal?.addEventListener('abort', () => server.close())
  })
}

export function createNodeAdapter(): RuntimeAdapter {
  return {
    target: 'standalone',
    start: (app, opts) => listenWithNodeServer(app, opts),
    // standalone 通常直连，不信任 X-Forwarded-*（除非在自建网关后）
    trustProxy: () => process.env.TRUST_PROXY === '1',
    assetsDir: (env) => resolve(env.HOMURA_ASSETS_DIR ?? 'dist/client'),
  }
}
