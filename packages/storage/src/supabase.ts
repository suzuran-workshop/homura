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
      return {
        data: new Uint8Array(await res.arrayBuffer()),
        contentType: res.headers.get('content-type') ?? undefined,
      }
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

export interface SupabaseStorageEnv {
  /** 平台 URL（已去尾斜杠），如 https://supabase.<平台域> */
  platformUrl: string
  /** anon key（public bucket 足够；private bucket 需 service role key，而平台不下发） */
  apiKey: string
}

/**
 * 从 env 解析 supabase storage 所需的最小集：平台 URL + anon key。
 *
 * 与 @homurajs/db/pg 的 loadSupabaseEnv（PG 直连，需 PROJECT_REF + DB_PASSWORD）**刻意分离**：
 * 2026-10-13 实测 qw-pages 只注入 SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_INSTANCE_ID，
 * 既无 project ref 也无 DB 密码，且平台没有自定义 env 注入口 → PG 直连在 Pages 上不可用。
 * 旧实现让 storage 复用 PG 的 loader，导致「只想要对象存储」也被 PG 凭据缺失一起拖死。
 *
 * ⚠ Pages 上的硬限制（均为实测）：
 * - anon 无建桶权：POST /storage/v1/bucket → 400（内层 403 "new row violates row-level security policy"）
 * - 受控迁移角色对 storage schema 也无权：INSERT INTO storage.buckets → 42501 permission denied
 * → **bucket 必须预先存在**，否则 upload/download 一律 "Bucket not found"。
 * - GET /storage/v1/bucket 可达（200，实测返回空数组），说明端点与鉴权本身没问题。
 */
export function loadSupabaseStorageEnv(env: NodeJS.ProcessEnv): SupabaseStorageEnv {
  const platformUrl = (env['SUPABASE_URL'] ?? env['SUPABASE_PLATFORM_URL'] ?? '').replace(/\/$/, '')
  const apiKey = env['SUPABASE_ANON_KEY'] ?? ''
  const missing = [
    !platformUrl ? 'SUPABASE_URL' : null,
    !apiKey ? 'SUPABASE_ANON_KEY' : null,
  ].filter((x): x is string => x !== null)
  if (missing.length > 0) {
    throw new Error(
      `supabase storage 环境不完整：缺少 ${missing.join(' 与 ')}。` +
        '（qw-pages 会自动注入这两项；独立部署需自行设置。' +
        'SUPABASE_PROJECT_REF / SUPABASE_DB_PASSWORD 是 PG 直连用的，Pages 不下发，storage 也不需要）',
    )
  }
  return { platformUrl, apiKey }
}
