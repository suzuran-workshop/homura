/**
 * local-fs 后端：独立单机形态的缺省实现。
 * - meta sidecar（<key>.meta.json）记录 contentType/size/uploadedAt
 * - presign 降级为代理路径（接口语义：给我一个可下载 URL）
 */
import { createReadStream, existsSync } from 'node:fs'
import { mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import {
  assertSafeObjectKey,
  proxyUrl,
  type FileInfo,
  type FileStorage,
  type UploadResult,
} from './index.js'

interface Meta {
  contentType: string
  size: number
  uploadedAt: string
}

const metaPath = (root: string, key: string): string => `${resolve(root, key)}.meta.json`

async function* walk(dir: string, base = dir): AsyncGenerator<string> {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) yield* walk(full, base)
    else if (!entry.name.endsWith('.meta.json')) yield full.slice(base.length + 1)
  }
}

export function createLocalStorage(options: { rootDir: string }): FileStorage {
  const root = resolve(options.rootDir)

  const put = async (key: string, data: Uint8Array, contentType: string): Promise<UploadResult> => {
    assertSafeObjectKey(key)
    const abs = join(root, key)
    await mkdir(dirname(abs), { recursive: true })
    await writeFile(abs, data)
    const uploadedAt = new Date()
    const meta: Meta = { contentType, size: data.byteLength, uploadedAt: uploadedAt.toISOString() }
    await writeFile(metaPath(root, key), JSON.stringify(meta))
    return { objectKey: key, url: proxyUrl(key), size: data.byteLength, uploadedAt }
  }

  return {
    async uploadFile(ns, fileName, data, contentType) {
      assertSafeObjectKey(ns)
      const safeName = fileName.replace(/[/\\]/g, '_')
      const key = `${ns}/files/${Date.now()}_${safeName}`
      return put(key, toBytes(data), contentType)
    },

    async uploadFileRaw(objectKey, data, contentType) {
      return put(objectKey, toBytes(data), contentType)
    },

    async downloadFile(objectKey) {
      const abs = join(root, objectKey)
      if (!existsSync(abs)) throw new Error(`object not found: ${objectKey}`)
      const data = await readFile(abs)
      let contentType: string | undefined
      try {
        const meta = JSON.parse(await readFile(metaPath(root, objectKey), 'utf-8')) as Meta
        contentType = meta.contentType
      } catch {
        contentType = undefined
      }
      return { data, contentType }
    },

    async getPresignedUrl(objectKey) {
      return proxyUrl(objectKey)
    },

    async deleteFile(objectKey) {
      await rm(join(root, objectKey), { force: true })
      await rm(metaPath(root, objectKey), { force: true })
    },

    async listFiles(ns, prefix, limit): Promise<FileInfo[]> {
      assertSafeObjectKey(ns)
      const dir = join(root, ns)
      if (!existsSync(dir)) return []
      const out: FileInfo[] = []
      // walk 返回 ns 内相对路径；objectKey 拼回全路径
      for await (const rel of walk(dir)) {
        if (prefix && !rel.startsWith(prefix)) continue
        const abs = join(dir, rel)
        const s = await stat(abs)
        let contentType: string | undefined
        const key = `${ns}/${rel}`
        try {
          const meta = JSON.parse(await readFile(metaPath(root, key), 'utf-8')) as Meta
          contentType = meta.contentType
        } catch {
          contentType = undefined
        }
        out.push({
          objectKey: key,
          size: s.size,
          updatedAt: s.mtime,
          contentType,
        })
        if (out.length >= limit) break
      }
      return out
    },
  }
}

function toBytes(data: Uint8Array | ReadableStream<Uint8Array>): Uint8Array {
  if (data instanceof Uint8Array) return data
  throw new Error('local 后端不支持流式载荷：请先聚合为 Uint8Array')
}

export { createReadStream }
