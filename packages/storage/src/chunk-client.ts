/**
 * 浏览器端分块上传 SDK（./chunk-client 子路径）——**浏览器安全，零 node 依赖**。
 *
 * 为什么需要：qw-pages 网关对单请求 body 有上限（实测 ≥1MB 413）。把大文件在浏览器侧切成
 * ≤chunkSize 的块、每块一个**原始字节**请求（不 base64，请求体 = raw 块大小，最大化避开网关限制），
 * 服务端收到后再 base64 入库。下载方向由服务端 `downloadStream` 逐块流式重组，浏览器普通 fetch 即可。
 *
 * 协议（与模板 /api/files/* 路由对应）：
 *   POST initUrl     { ns?, fileName, contentType, totalSize, chunkSize? } → { objectKey, url, chunkCount, chunkSize }
 *   PUT  chunkUrl?key=&index=  body=原始字节（application/octet-stream）   → 200
 *   POST completeUrl { objectKey }                                        → { manifest }
 *
 * 用法：
 *   import { uploadChunked } from '@homurajs/storage/chunk-client'
 *   const r = await uploadChunked(file, { onProgress: (loaded, total) => ... })
 *   // r.url 即 /files/<objectKey> 代理下载地址
 */

export interface ChunkUploadOptions {
  /** 每块原始字节数（缺省 384KB：base64 入库后 512KB，安全避开网关与 PostgREST ~1MB 限制） */
  chunkSize?: number
  /** 命名空间前缀（缺省 'anon'；服务端会用它拼 objectKey） */
  ns?: string
  initUrl?: string
  chunkUrl?: string
  completeUrl?: string
  /** 注入 fetch（测试 / 自定义鉴权头）；缺省全局 fetch */
  fetchImpl?: typeof fetch
  /** 进度回调（已上传原始字节数 / 总字节数） */
  onProgress?: (loaded: number, total: number) => void
  /** 并发上传块数（缺省 1 = 串行，最稳；I/O 密集可调 3~4 提速） */
  concurrency?: number
  signal?: AbortSignal
}

export interface ChunkUploadResult {
  objectKey: string
  url: string
  size: number
  chunkCount: number
}

export const DEFAULT_CLIENT_CHUNK_SIZE = 384 * 1024

interface InitResponse {
  objectKey: string
  url: string
  chunkCount: number
  chunkSize: number
}

/** 把 Blob 读成 Uint8Array（浏览器 + Node 18+ 均有 Blob.arrayBuffer） */
async function blobToBytes(blob: Blob): Promise<Uint8Array> {
  return new Uint8Array(await blob.arrayBuffer())
}

export async function uploadChunked(
  file: Blob,
  opts: ChunkUploadOptions = {},
): Promise<ChunkUploadResult> {
  const chunkSize = opts.chunkSize ?? DEFAULT_CLIENT_CHUNK_SIZE
  const doFetch = opts.fetchImpl ?? fetch
  const initUrl = opts.initUrl ?? '/api/files/init'
  const chunkUrl = opts.chunkUrl ?? '/api/files/chunk'
  const completeUrl = opts.completeUrl ?? '/api/files/complete'
  const concurrency = Math.max(1, opts.concurrency ?? 1)
  const total = file.size
  const fileName = (file as File).name ?? 'blob'
  const contentType = (file as File).type || 'application/octet-stream'

  // 1) init：服务端建清单、返回 objectKey 与块数
  const initRes = await doFetch(
    initUrl,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ns: opts.ns, fileName, contentType, totalSize: total, chunkSize }),
      signal: opts.signal,
    },
  )
  if (!initRes.ok) {
    throw new Error(`init 上传失败 HTTP ${initRes.status}: ${await safeText(initRes)}`)
  }
  const init = (await initRes.json()) as InitResponse
  const { objectKey, chunkCount } = init

  // 2) 逐块上传（原始字节 body；带界并发）
  let uploaded = 0
  let cursor = 0
  const uploadOne = async (index: number): Promise<void> => {
    const start = index * chunkSize
    const end = Math.min(start + chunkSize, total)
    const bytes = await blobToBytes(file.slice(start, end))
    const url = `${chunkUrl}?key=${encodeURIComponent(objectKey)}&index=${index}`
    const res = await doFetch(url, {
      method: 'PUT',
      headers: { 'content-type': 'application/octet-stream' },
      // 双重 cast：Uint8Array 在 DOM lib 下不直接匹配 BodyInit（TS 5.7+ 泛型变体），
      // 而 Node lib 下无 BodyInit 名——用两边都有的 RequestInit['body'] 规避
      body: bytes as unknown as RequestInit['body'],
      signal: opts.signal,
    })
    if (!res.ok) throw new Error(`分块 ${index} 上传失败 HTTP ${res.status}: ${await safeText(res)}`)
    uploaded += bytes.byteLength
    opts.onProgress?.(Math.min(uploaded, total), total)
  }
  // 简单带界并发池：concurrency 个 worker 从共享游标取块
  const worker = async (): Promise<void> => {
    for (;;) {
      const i = cursor++
      if (i >= chunkCount) return
      await uploadOne(i)
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, chunkCount) }, () => worker()))

  // 3) complete：服务端校验块齐 → status=complete
  const compRes = await doFetch(completeUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ objectKey }),
    signal: opts.signal,
  })
  if (!compRes.ok) {
    throw new Error(`complete 上传失败 HTTP ${compRes.status}: ${await safeText(compRes)}`)
  }
  return { objectKey, url: init.url, size: total, chunkCount }
}

/**
 * 下载并还原为 Blob。服务端 `/files/<key>` 已流式重组，浏览器普通 fetch 即可——
 * 本 helper 只是包一层，方便拿 Blob/进度。超大文件建议直接用 <a href=url download> 让浏览器接管。
 */
export async function downloadAsBlob(
  url: string,
  opts: { fetchImpl?: typeof fetch; signal?: AbortSignal } = {},
): Promise<Blob> {
  const doFetch = opts.fetchImpl ?? fetch
  const res = await doFetch(url, { signal: opts.signal })
  if (!res.ok) throw new Error(`下载失败 HTTP ${res.status}: ${await safeText(res)}`)
  return res.blob()
}

/**
 * 预签名直传：把整个文件 PUT 到对象存储的预签名 URL（字节不过 App、不过网关）。
 * **大文件正解**——绕开 qw-pages 网关 body 上限，也避免 DB 分块开销。浏览器直接流式发送 Blob。
 *
 * ⚠ content-type 必须与签发预签名时一致（若签名覆盖了 ContentType），否则对象存储会拒（403）。
 * ⚠ 需对象存储侧配好 CORS：允许来源（Pages 域名）的 PUT 方法 + Content-Type 头。
 *
 * 配套服务端：s3 后端 `getSignedUploadUrl(objectKey, contentType, expirySeconds)`，
 * 模板经 `/api/files/presign` 暴露。
 */
export async function uploadViaPresign(
  file: Blob,
  presignedUrl: string,
  opts: { fetchImpl?: typeof fetch; contentType?: string; signal?: AbortSignal } = {},
): Promise<void> {
  const doFetch = opts.fetchImpl ?? fetch
  const contentType = opts.contentType ?? ((file as File).type || 'application/octet-stream')
  const res = await doFetch(presignedUrl, {
    method: 'PUT',
    headers: { 'content-type': contentType },
    body: file,
    signal: opts.signal,
  })
  if (!res.ok) throw new Error(`预签名直传失败 HTTP ${res.status}: ${await safeText(res)}`)
}

async function safeText(res: Response): Promise<string> {
  try {
    return (await res.text()).slice(0, 200)
  } catch {
    return ''
  }
}
