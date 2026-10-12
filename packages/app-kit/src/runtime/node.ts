/**
 * standalone 适配器：@hono/node-server 端口监听。
 * 可选 peer：@hono/node-server（动态 import，不装也能 typecheck 其余部分）。
 * 静态资源由 createApp 的 staticDir 挂载（见 static.ts），adapter 只负责监听与 trust proxy。
 */
import { resolve } from 'node:path'
import type { Hono } from 'hono'
import type { RuntimeAdapter } from './adapter.js'

export function createNodeAdapter(): RuntimeAdapter {
  return {
    target: 'standalone',
    async start(app: Hono, opts) {
      const { serve } = await import('@hono/node-server')
      const port = opts.port ?? Number(process.env.PORT ?? 3000)
      return new Promise<void>((resolveStart) => {
        const server = serve({ fetch: app.fetch, port }, () => {
          resolveStart()
        })
        opts.signal?.addEventListener('abort', () => server.close())
      })
    },
    // standalone 通常直连，不信任 X-Forwarded-*（除非在自建网关后）
    trustProxy: () => process.env.TRUST_PROXY === '1',
    assetsDir: (env) => resolve(env.HOMURA_ASSETS_DIR ?? 'dist/client'),
  }
}
