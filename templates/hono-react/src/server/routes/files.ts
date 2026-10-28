/**
 * /api/files 上传路由 + /files 代理下载。
 * 活文档：示范 @homurajs/storage 的三后端（由 STORAGE_BACKEND env 切换）+ 代理 URL 模式。
 * 上传返回的 url 是 /files/<key> 代理路径（不直接暴露存储地址）。
 */
import { Hono } from 'hono'
import { generateObjectKey, type FileStorage } from '@homurajs/storage'
import { createFileProxyRoutes } from '@homurajs/storage/proxy'

export function buildFileRoutes(storage: FileStorage): Hono {
  const app = new Hono()

  // multipart 上传（整文件，一次性）：字段 file；ns 用当前用户 sub（登录）或 'anon'
  app.post('/api/upload', async (c) => {
    const auth = c.get('auth')
    const ns = auth?.sub ?? 'anon'
    const form = await c.req.formData().catch(() => null)
    const file = form?.get('file')
    if (!(file instanceof File)) return c.json({ error: 'file_required' }, 400)

    const bytes = new Uint8Array(await file.arrayBuffer())
    const result = await storage.uploadFile(ns, file.name, bytes, file.type || 'application/octet-stream')
    return c.json({ objectKey: result.objectKey, url: result.url, size: result.size }, 201)
  })

  // 列举当前 ns 下的文件
  app.get('/api/files', async (c) => {
    const auth = c.get('auth')
    const ns = auth?.sub ?? 'anon'
    const files = await storage.listFiles(ns, '', 50)
    return c.json({
      files: files.map((f) => ({ objectKey: f.objectKey, size: f.size, url: `/files/${f.objectKey}` })),
    })
  })

  // ── 预签名直传（仅 s3 兼容后端支持；大文件正解）──
  // 浏览器拿到 uploadUrl 后直接 PUT 到对象存储（阿里云 OSS 等），字节不过 App、不过网关。
  // ⚠ 对象存储侧须配 CORS（允许 App 域名的 PUT + Content-Type）。
  if (typeof storage.getSignedUploadUrl === 'function') {
    const signer = storage
    app.post('/api/files/presign', async (c) => {
      const auth = c.get('auth')
      const body = (await c.req.json().catch(() => null)) as {
        ns?: string
        fileName?: string
        contentType?: string
        expirySeconds?: number
      } | null
      if (!body?.fileName) return c.json({ error: 'fileName_required' }, 400)
      const ns = auth?.sub ?? body.ns ?? 'anon'
      const objectKey = generateObjectKey(ns, body.fileName, Date.now())
      const contentType = body.contentType || 'application/octet-stream'
      try {
        const uploadUrl = await signer.getSignedUploadUrl!(objectKey, contentType, body.expirySeconds ?? 900)
        return c.json({ objectKey, uploadUrl, contentType, downloadUrl: `/files/${objectKey}` })
      } catch (e) {
        return c.json({ error: 'presign_failed', message: e instanceof Error ? e.message : String(e) }, 500)
      }
    })
  }

  // /files/<key> 代理下载（三后端统一入口）
  app.route('/', createFileProxyRoutes(storage))

  return app
}
