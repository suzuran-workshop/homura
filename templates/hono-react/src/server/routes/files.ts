/**
 * /api/files 上传路由 + /files 代理下载。
 * 活文档：示范 @homurajs/storage 的四后端（由 STORAGE_BACKEND env 切换）+ 代理 URL 模式
 * + **分块上传协议**（仅 db 后端支持，绕开 qw-pages 网关 body 上限）。
 * 上传返回的 url 是 /files/<key> 代理路径（不直接暴露存储地址）。
 */
import { Hono } from 'hono'
import {
  generateObjectKey,
  type ChunkedFileStorage,
  type FileStorage,
} from '@homurajs/storage'
import { createFileProxyRoutes } from '@homurajs/storage/proxy'

/** 能力守卫：db 后端实现 ChunkedFileStorage（有 initUpload/putChunk/completeUpload） */
function isChunked(s: FileStorage): s is ChunkedFileStorage {
  return (
    typeof (s as ChunkedFileStorage).initUpload === 'function' &&
    typeof (s as ChunkedFileStorage).putChunk === 'function' &&
    typeof (s as ChunkedFileStorage).completeUpload === 'function'
  )
}

export function buildFileRoutes(storage: FileStorage): Hono {
  const app = new Hono()

  // multipart 上传（整文件，一次性）：字段 file；ns 用当前用户 sub（登录）或 'anon'
  // ⚠ 大文件在 qw-pages 上会撞网关 body 上限（413）→ 改用下方分块上传协议
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

  // ── 分块上传协议（仅 db 后端；前端用 @homurajs/storage/chunk-client 的 uploadChunked 对接）──
  // 为什么：qw-pages 网关对单请求 body 有上限（实测 ≥1MB 413）。把文件切成 ≤chunkSize 的块、
  // 每块一个原始字节请求（不 base64，请求体 = raw 块大小），即可传任意大文件（受总上限约束）。
  if (isChunked(storage)) {
    const chunked = storage

    // 1) init：服务端建清单、定 objectKey（强制 ns 前缀），返回块数
    app.post('/api/files/init', async (c) => {
      const auth = c.get('auth')
      const body = (await c.req.json().catch(() => null)) as {
        ns?: string
        fileName?: string
        contentType?: string
        totalSize?: number
        chunkSize?: number
      } | null
      const totalSize = Number(body?.totalSize)
      if (!body?.fileName || !Number.isFinite(totalSize) || totalSize < 0) {
        return c.json({ error: 'fileName_and_totalSize_required' }, 400)
      }
      const ns = auth?.sub ?? body.ns ?? 'anon'
      const objectKey = generateObjectKey(ns, body.fileName, Date.now())
      try {
        const r = await chunked.initUpload({
          objectKey,
          contentType: body.contentType || 'application/octet-stream',
          totalSize,
          chunkSize: body.chunkSize,
        })
        return c.json({ objectKey, url: `/files/${objectKey}`, chunkCount: r.chunkCount, chunkSize: r.chunkSize })
      } catch (e) {
        return c.json({ error: 'init_failed', message: e instanceof Error ? e.message : String(e) }, 400)
      }
    })

    // 2) chunk：原始字节 body（application/octet-stream），key+index 走 query
    app.put('/api/files/chunk', async (c) => {
      const key = c.req.query('key')
      const index = Number(c.req.query('index'))
      if (!key || !Number.isInteger(index) || index < 0) {
        return c.json({ error: 'key_and_index_required' }, 400)
      }
      const buf = await c.req.arrayBuffer()
      try {
        await chunked.putChunk(key, index, new Uint8Array(buf))
        return c.json({ ok: true })
      } catch (e) {
        return c.json({ error: 'chunk_failed', message: e instanceof Error ? e.message : String(e) }, 400)
      }
    })

    // 3) complete：校验块齐 → status=complete
    app.post('/api/files/complete', async (c) => {
      const body = (await c.req.json().catch(() => null)) as { objectKey?: string } | null
      if (!body?.objectKey) return c.json({ error: 'objectKey_required' }, 400)
      try {
        const manifest = await chunked.completeUpload(body.objectKey)
        return c.json({ manifest })
      } catch (e) {
        return c.json({ error: 'complete_failed', message: e instanceof Error ? e.message : String(e) }, 400)
      }
    })
  }

  // ── 预签名直传（仅 s3 兼容后端支持；大文件正解）──
  // 浏览器拿到 uploadUrl 后直接 PUT 到对象存储（阿里云 OSS 等），字节不过 App、不过网关，
  // 绕开 qw-pages 网关 body 上限，也避免 DB 分块开销。前端用 chunk-client 的 uploadViaPresign 对接。
  // ⚠ 对象存储侧须配 CORS（允许 Pages 域名的 PUT + Content-Type）。
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

  // /files/<key> 代理下载（四后端统一入口；db 后端走流式重组）
  app.route('/', createFileProxyRoutes(storage))

  return app
}
