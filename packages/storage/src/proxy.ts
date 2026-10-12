/**
 * Hono 代理路由：/files/<key> 统一下载入口（对冲各后端 URL 策略差异）。
 * 所有后端的 UploadResult.url 都指向本路由——不直接暴露存储地址。
 */
import { Hono } from 'hono'
import type { FileStorage } from './index.js'

export function createFileProxyRoutes(storage: FileStorage, options?: { mount?: string }): Hono {
  const mount = options?.mount ?? '/files'
  const app = new Hono()

  app.get(`${mount}/:key{.+}`, async (c) => {
    const key = c.req.param('key')
    try {
      const { data, contentType } = await storage.downloadFile(key)
      return new Response(data, {
        headers: {
          'content-type': contentType ?? 'application/octet-stream',
          'cache-control': 'public, max-age=31536000, immutable',
        },
      })
    } catch {
      return c.text('not found', 404)
    }
  })

  return app
}
