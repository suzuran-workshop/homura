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
      // 分块后端优先走流式下载：逐块 yield，避免整文件进内存（大文件关键）
      if (storage.downloadStream) {
        const { stream, contentType, size } = await storage.downloadStream(key)
        return new Response(stream, {
          headers: {
            'content-type': contentType ?? 'application/octet-stream',
            'content-length': String(size),
            'cache-control': 'public, max-age=31536000, immutable',
          },
        })
      }
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
