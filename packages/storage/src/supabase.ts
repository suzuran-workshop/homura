/**
 * supabase storage 后端：qw-pages 云形态。
 * 手写 REST（零 SDK 依赖，fetchImpl 可注入测试）：
 * - upload: POST /storage/v1/object/{bucket}/{key}
 * - download: GET /storage/v1/object/{bucket}/{key}
 * - presign: POST /storage/v1/object/sign/{bucket}/{key}
 * - delete: DELETE /storage/v1/object/{bucket}/{key}
 * - list: POST /storage/v1/object/list/{bucket}
 */
import {
  assertSafeObjectKey,
  proxyUrl,
  type FileInfo,
  type FileStorage,
  type UploadResult,
} from './index.js'

export interface SupabaseStorageOptions {
  platformUrl: string
  /** public bucket 用 anonKey；private bucket 用 service role key */
  apiKey: string
  bucket: string
  fetchImpl?: typeof fetch
}

export function createSupabaseStorage(options: SupabaseStorageOptions): FileStorage {
  const fetchImpl = options.fetchImpl ?? fetch
  const base = options.platformUrl.replace(/\/$/, '')
  const bucket = options.bucket
  const headers = () => ({
    authorization: `Bearer ${options.apiKey}`,
    apikey: options.apiKey,
  })

  const put = async (key: string, data: Uint8Array, contentType: string): Promise<UploadResult> => {
    assertSafeObjectKey(key)
    const res = await fetchImpl(`${base}/storage/v1/object/${bucket}/${key}`, {
      method: 'POST',
      headers: {
        ...headers(),
        'content-type': contentType,
        'x-upsert': 'true',
      },
      body: data,
    })
    if (!res.ok) throw new Error(`supabase upload failed: ${res.status} ${await res.text()}`)
    const uploadedAt = new Date()
    return { objectKey: key, url: proxyUrl(key), size: data.byteLength, uploadedAt }
  }

  return {
    async uploadFile(ns, fileName, data, contentType) {
      assertSafeObjectKey(ns)
      const safeName = fileName.replace(/[/\\]/g, '_')
      return put(`${ns}/files/${Date.now()}_${safeName}`, toBytes(data), contentType)
    },

    async uploadFileRaw(objectKey, data, contentType) {
      return put(objectKey, toBytes(data), contentType)
    },

    async downloadFile(objectKey) {
      const res = await fetchImpl(`${base}/storage/v1/object/${bucket}/${objectKey}`, {
        headers: headers(),
      })
      if (!res.ok) throw new Error(`supabase download failed: ${res.status}`)
      return { data: new Uint8Array(await res.arrayBuffer()), contentType: res.headers.get('content-type') ?? undefined }
    },

    async getPresignedUrl(objectKey, expirySeconds) {
      const res = await fetchImpl(`${base}/storage/v1/object/sign/${bucket}/${objectKey}`, {
        method: 'POST',
        headers: { ...headers(), 'content-type': 'application/json' },
        body: JSON.stringify({ expiresIn: expirySeconds }),
      })
      if (!res.ok) return proxyUrl(objectKey) // 降级
      const { signedURL } = (await res.json()) as { signedURL: string }
      return `${base}/storage/v1${signedURL}`
    },

    async deleteFile(objectKey) {
      const res = await fetchImpl(`${base}/storage/v1/object/${bucket}/${objectKey}`, {
        method: 'DELETE',
        headers: headers(),
      })
      if (!res.ok) throw new Error(`supabase delete failed: ${res.status}`)
    },

    async listFiles(ns, prefix, limit): Promise<FileInfo[]> {
      assertSafeObjectKey(ns)
      const res = await fetchImpl(`${base}/storage/v1/object/list/${bucket}`, {
        method: 'POST',
        headers: { ...headers(), 'content-type': 'application/json' },
        body: JSON.stringify({
          prefix: `${ns}/${prefix}`,
          limit,
          sortBy: { column: 'name', order: 'asc' },
        }),
      })
      if (!res.ok) throw new Error(`supabase list failed: ${res.status}`)
      const items = (await res.json()) as Array<{
        name: string
        id: string | null
        metadata?: { size?: number; lastModified?: string; mimetype?: string }
      }>
      return items
        .filter((it) => it.id !== null)
        .map((it) => ({
          objectKey: `${ns}/${prefix}${it.name}`,
          size: it.metadata?.size ?? 0,
          updatedAt: new Date(it.metadata?.lastModified ?? Date.now()),
          contentType: it.metadata?.mimetype,
        }))
    },
  }
}

function toBytes(data: Uint8Array | ReadableStream<Uint8Array>): Uint8Array {
  if (data instanceof Uint8Array) return data
  throw new Error('supabase 后端不支持流式载荷：请先聚合为 Uint8Array')
}
