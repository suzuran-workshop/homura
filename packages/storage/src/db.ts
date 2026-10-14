/**
 * DB-backed storage：把二进制**分块**写进数据库的 ChunkedFileStorage 实现（./db 子路径）。
 *
 * 定位是 qw-pages 上唯一可用的 storage 后端（local/s3/supabase 在 Pages 全倒），也是"无对象存储
 * 时"的兜底。强制分块（即使小文件也 1 块）以绕开两道平台限制：
 *   - 网关 body 上限：实测 ≥1MB 被 openresty 413（请求到不了 App）
 *   - PostgREST 单值上限：~1MB（768KB raw→base64 ~1MB 报 500）
 * 每块 base64 后 ≤512KB（raw 缺省 384KB），两道限制都安全避开 → 支持大文件（受可配总上限约束）。
 *
 * 两实现（drizzle=SQL 方言 / rest=PostgREST），接口语义严格对齐。为免逻辑写两遍，公共的
 * ChunkedFileStorage 行为收在 defineChunkedStore(ops)，两方言各自提供低层 StoreOps 适配器。
 *
 * ⚠ data 列是 **base64 文本**（不是 bytea/blob）：PostgREST 对 bytea 的 JSON 编解码不可靠
 *   （2026-10-14 Pages 实测：308B 进去、618B mojibake 出来），文本列三方言一致、编解码由本文件控制。
 * ⚠ 列名显式 snake_case，与 ./tables.ts 严格对齐。
 * ⚠ presign 下载无意义（DB 无直连 URL），降级为代理路径 /files/<key>；大文件正解是 s3 预签名直传。
 */
import { sql } from 'drizzle-orm'
import type { NodeSQLiteDatabase } from 'drizzle-orm/node-sqlite'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import { isSqlite, type RestDb } from '@homurajs/db'
import {
  assertSafeObjectKey,
  generateObjectKey,
  proxyUrl,
  type ChunkedFileStorage,
  type FileInfo,
  type FileManifest,
  type FilePayload,
  type UploadResult,
} from './index.js'
import { STORAGE_CHUNKS_TABLE, STORAGE_FILES_TABLE } from './tables.js'

export type DrizzleDb = PostgresJsDatabase | NodeSQLiteDatabase

/** 每块原始字节缺省 384KB（base64 后 512KB，安全避开网关与 PostgREST 的 ~1MB 限制） */
export const DEFAULT_CHUNK_SIZE = 384 * 1024
/** 单文件总上限缺省 50MB：DB 存 blob 是反模式，"无限大"是陷阱（成本/速度/无 CDN），故设可配上限 */
export const DEFAULT_MAX_TOTAL_BYTES = 50 * 1024 * 1024
/** 未完成上传（status=uploading）超过此时长视为残块，可被 GC 清扫（缺省 24h） */
export const DEFAULT_STALE_UPLOAD_MS = 24 * 60 * 60 * 1000

export interface DbFileStoreOptions {
  /** 清单表名（缺省 homura_files） */
  table?: string
  /** 分块表名（缺省 homura_file_chunks） */
  chunkTable?: string
  /** 每块原始字节数（缺省 384KB） */
  chunkSize?: number
  /** 单文件总上限（字节，缺省 50MB）；超限 initUpload/upload 抛错 */
  maxTotalBytes?: number
  /** 残块判定时长（ms，缺省 24h） */
  staleUploadMs?: number
  /** 顺带清扫残块的概率（缺省 0.05；测试传 0 或 1 消除随机性） */
  sweepProbability?: number
  /** 时间注入（测试用） */
  now?: () => number
}

interface ManifestRow {
  object_key: string
  content_type: string
  total_size: number
  chunk_size: number
  chunk_count: number
  status: string
  created_at: number
  updated_at: number
  [column: string]: unknown
}

/** 低层存储适配器：两方言各自实现，公共逻辑在 defineChunkedStore */
interface StoreOps {
  upsertManifest(row: ManifestRow): Promise<void>
  getManifestRow(key: string): Promise<ManifestRow | null>
  setManifestStatus(key: string, status: string, updatedAt: number): Promise<void>
  deleteManifest(key: string): Promise<void>
  upsertChunk(key: string, index: number, b64: string): Promise<void>
  getChunkB64(key: string, index: number): Promise<string | null>
  countChunks(key: string): Promise<number>
  deleteChunks(key: string): Promise<void>
  listManifests(ns: string, prefix: string, limit: number): Promise<ManifestRow[]>
  findStaleUploading(beforeMs: number, limit: number): Promise<ManifestRow[]>
}

// ── 共享工具 ──

function toBytes(data: FilePayload): Uint8Array {
  if (data instanceof Uint8Array) return data
  throw new Error('db 后端不支持流式载荷：请先聚合为 Uint8Array（或用分块上传协议逐块传）')
}
function toBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64')
}
function fromBase64(b64: string): Uint8Array {
  return new Uint8Array(Buffer.from(b64, 'base64'))
}
function chunkCountOf(totalSize: number, chunkSize: number): number {
  return Math.max(1, Math.ceil(totalSize / chunkSize))
}
function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (ch) => `\\${ch}`)
}
function toManifest(r: ManifestRow): FileManifest {
  return {
    objectKey: r.object_key,
    contentType: r.content_type,
    totalSize: Number(r.total_size),
    chunkSize: Number(r.chunk_size),
    chunkCount: Number(r.chunk_count),
    status: r.status as FileManifest['status'],
    createdAt: new Date(Number(r.created_at)),
  }
}

interface NormalizedOpts {
  table: string
  chunkTable: string
  chunkSize: number
  maxTotalBytes: number
  staleUploadMs: number
  sweepProbability: number
  now: () => number
}
function normalizeOpts(opts: DbFileStoreOptions): NormalizedOpts {
  return {
    table: opts.table ?? STORAGE_FILES_TABLE,
    chunkTable: opts.chunkTable ?? STORAGE_CHUNKS_TABLE,
    chunkSize: opts.chunkSize ?? DEFAULT_CHUNK_SIZE,
    maxTotalBytes: opts.maxTotalBytes ?? DEFAULT_MAX_TOTAL_BYTES,
    staleUploadMs: opts.staleUploadMs ?? DEFAULT_STALE_UPLOAD_MS,
    sweepProbability: opts.sweepProbability ?? 0.05,
    now: opts.now ?? (() => Date.now()),
  }
}

/** 公共 ChunkedFileStorage 行为（两方言共用），只依赖低层 StoreOps */
function defineChunkedStore(ops: StoreOps, o: NormalizedOpts): ChunkedFileStorage {
  const sweepStale = async (): Promise<void> => {
    if (Math.random() >= o.sweepProbability) return
    const stale = await ops.findStaleUploading(o.now() - o.staleUploadMs, 50)
    for (const m of stale) {
      await ops.deleteChunks(m.object_key)
      await ops.deleteManifest(m.object_key)
    }
  }

  const initUpload: ChunkedFileStorage['initUpload'] = async (input) => {
    assertSafeObjectKey(input.objectKey)
    if (input.totalSize > o.maxTotalBytes) {
      throw new Error(
        `文件 ${input.totalSize}B 超过 db 后端总上限 ${o.maxTotalBytes}B：` +
          'DB 存二进制是兜底方案，大文件请改用 s3 预签名直传（阿里云 OSS 等）',
      )
    }
    const chunkSize = input.chunkSize ?? o.chunkSize
    if (chunkSize <= 0) throw new Error('chunkSize 必须为正')
    const chunkCount = chunkCountOf(input.totalSize, chunkSize)
    const ts = o.now()
    await ops.upsertManifest({
      object_key: input.objectKey,
      content_type: input.contentType,
      total_size: input.totalSize,
      chunk_size: chunkSize,
      chunk_count: chunkCount,
      status: 'uploading',
      created_at: ts,
      updated_at: ts,
    })
    // 顺带清扫残块（await 而非 fire-and-forget：Pages/serverless 进程可能在响应后冻结，
    // 后台任务会被杀；且 await 让 GC 对测试确定）。失败不影响本次上传。
    try {
      await sweepStale()
    } catch {
      // ignore
    }
    return { objectKey: input.objectKey, chunkCount, chunkSize }
  }

  const putChunk: ChunkedFileStorage['putChunk'] = async (objectKey, index, data) => {
    const m = await ops.getManifestRow(objectKey)
    if (!m) throw new Error(`upload not initialized: ${objectKey}`)
    if (index < 0 || index >= m.chunk_count) {
      throw new Error(`chunk index ${index} 越界（共 ${m.chunk_count} 块）`)
    }
    if (data.byteLength > m.chunk_size) {
      throw new Error(`分块 ${data.byteLength}B 超过 chunkSize ${m.chunk_size}B`)
    }
    await ops.upsertChunk(objectKey, index, toBase64(data))
    await ops.setManifestStatus(objectKey, 'uploading', o.now()) // 刷新 updated_at，避免被 GC 误清
  }

  const completeUpload: ChunkedFileStorage['completeUpload'] = async (objectKey) => {
    const m = await ops.getManifestRow(objectKey)
    if (!m) throw new Error(`upload not initialized: ${objectKey}`)
    const have = await ops.countChunks(objectKey)
    if (have < m.chunk_count) {
      throw new Error(`分块不齐：已有 ${have}/${m.chunk_count}，无法完成上传`)
    }
    await ops.setManifestStatus(objectKey, 'complete', o.now())
    return toManifest({ ...m, status: 'complete' })
  }

  const getManifest: ChunkedFileStorage['getManifest'] = async (objectKey) => {
    const m = await ops.getManifestRow(objectKey)
    return m ? toManifest(m) : null
  }

  const readChunkB64 = async (objectKey: string, index: number): Promise<string> => {
    const b64 = await ops.getChunkB64(objectKey, index)
    if (b64 === null) throw new Error(`chunk missing: ${objectKey}#${index}`)
    return b64
  }

  const downloadStream: ChunkedFileStorage['downloadStream'] = async (objectKey) => {
    const m = await ops.getManifestRow(objectKey)
    if (!m || m.status !== 'complete') throw new Error(`object not found: ${objectKey}`)
    let i = 0
    const stream = new ReadableStream<Uint8Array>({
      pull: async (controller) => {
        if (i >= m.chunk_count) {
          controller.close()
          return
        }
        controller.enqueue(fromBase64(await readChunkB64(objectKey, i)))
        i++
      },
    })
    return { stream, contentType: m.content_type, size: Number(m.total_size) }
  }

  const downloadFile: ChunkedFileStorage['downloadFile'] = async (objectKey) => {
    const { stream, contentType } = await downloadStream(objectKey)
    const reader = stream.getReader()
    const parts: Uint8Array[] = []
    let total = 0
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      if (value) {
        parts.push(value)
        total += value.byteLength
      }
    }
    const out = new Uint8Array(total)
    let off = 0
    for (const p of parts) {
      out.set(p, off)
      off += p.byteLength
    }
    return { data: out, contentType }
  }

  const uploadWhole = async (
    key: string,
    data: Uint8Array,
    contentType: string,
  ): Promise<UploadResult> => {
    const { chunkCount, chunkSize } = await initUpload({
      objectKey: key,
      contentType,
      totalSize: data.byteLength,
    })
    for (let i = 0; i < chunkCount; i++) {
      await putChunk(key, i, data.subarray(i * chunkSize, (i + 1) * chunkSize))
    }
    await completeUpload(key)
    return { objectKey: key, url: proxyUrl(key), size: data.byteLength, uploadedAt: new Date(o.now()) }
  }

  return {
    initUpload,
    putChunk,
    completeUpload,
    getManifest,
    downloadStream,
    downloadFile,
    async uploadFile(ns, fileName, data, contentType) {
      return uploadWhole(generateObjectKey(ns, fileName, o.now()), toBytes(data), contentType)
    },
    async uploadFileRaw(objectKey, data, contentType) {
      return uploadWhole(objectKey, toBytes(data), contentType)
    },
    async getPresignedUrl(objectKey) {
      return proxyUrl(objectKey)
    },
    async deleteFile(objectKey) {
      await ops.deleteChunks(objectKey)
      await ops.deleteManifest(objectKey)
    },
    async listFiles(ns, prefix, limit): Promise<FileInfo[]> {
      assertSafeObjectKey(ns)
      const rows = await ops.listManifests(ns, prefix, limit)
      return rows.map((r) => ({
        objectKey: r.object_key,
        size: Number(r.total_size),
        updatedAt: new Date(Number(r.created_at)),
        contentType: r.content_type,
      }))
    },
  }
}

// ── SQL 方言（sqlite / pg）──

export function createDrizzleFileStore(
  db: DrizzleDb,
  opts: DbFileStoreOptions = {},
): ChunkedFileStorage {
  const o = normalizeOpts(opts)
  const sqlite = isSqlite(db as never)
  const files = o.table
  const chunks = o.chunkTable

  const ready = (async () => {
    // data 列是 base64 TEXT；created_at/updated_at/total_size 按方言分（sqlite INTEGER / pg BIGINT）
    const numType = sqlite ? 'INTEGER' : 'BIGINT'
    const ddlFiles = sql.raw(
      `CREATE TABLE IF NOT EXISTS ${files} (` +
        `object_key TEXT PRIMARY KEY, content_type TEXT NOT NULL, total_size ${numType} NOT NULL, ` +
        `chunk_size INTEGER NOT NULL, chunk_count INTEGER NOT NULL, status TEXT NOT NULL, ` +
        `created_at ${numType} NOT NULL, updated_at ${numType} NOT NULL)`,
    )
    const ddlChunks = sql.raw(
      `CREATE TABLE IF NOT EXISTS ${chunks} (` +
        `object_key TEXT NOT NULL, chunk_index INTEGER NOT NULL, data TEXT NOT NULL, ` +
        `PRIMARY KEY (object_key, chunk_index))`,
    )
    const runRaw = async (q: ReturnType<typeof sql.raw>) => {
      if (sqlite) await (db as NodeSQLiteDatabase).run(sql`${q}`)
      else await (db as PostgresJsDatabase).execute(sql`${q}` as never)
    }
    await runRaw(ddlFiles)
    await runRaw(ddlChunks)
  })()

  const run = async (q: ReturnType<typeof sql>): Promise<void> => {
    await ready
    if (sqlite) await (db as NodeSQLiteDatabase).run(q)
    else await (db as PostgresJsDatabase).execute(q as never)
  }
  const all = async <T>(q: ReturnType<typeof sql>): Promise<T[]> => {
    await ready
    if (sqlite) return (await (db as NodeSQLiteDatabase).all(q as never)) as unknown as T[]
    const res = await (db as PostgresJsDatabase).execute(q as never)
    return (res as unknown as T[]) ?? []
  }
  const one = async <T>(q: ReturnType<typeof sql>): Promise<T | null> => {
    const rows = await all<T>(q)
    return rows[0] ?? null
  }

  const ops: StoreOps = {
    async upsertManifest(r) {
      await run(sql`INSERT INTO ${sql.raw(files)} (object_key, content_type, total_size, chunk_size, chunk_count, status, created_at, updated_at)
VALUES (${r.object_key}, ${r.content_type}, ${r.total_size}, ${r.chunk_size}, ${r.chunk_count}, ${r.status}, ${r.created_at}, ${r.updated_at})
ON CONFLICT (object_key) DO UPDATE SET
  content_type = excluded.content_type, total_size = excluded.total_size, chunk_size = excluded.chunk_size,
  chunk_count = excluded.chunk_count, status = excluded.status, updated_at = excluded.updated_at`)
    },
    async getManifestRow(key) {
      return one<ManifestRow>(
        sql`SELECT object_key, content_type, total_size, chunk_size, chunk_count, status, created_at, updated_at FROM ${sql.raw(files)} WHERE object_key = ${key}`,
      )
    },
    async setManifestStatus(key, status, updatedAt) {
      await run(
        sql`UPDATE ${sql.raw(files)} SET status = ${status}, updated_at = ${updatedAt} WHERE object_key = ${key}`,
      )
    },
    async deleteManifest(key) {
      await run(sql`DELETE FROM ${sql.raw(files)} WHERE object_key = ${key}`)
    },
    async upsertChunk(key, index, b64) {
      await run(sql`INSERT INTO ${sql.raw(chunks)} (object_key, chunk_index, data)
VALUES (${key}, ${index}, ${b64})
ON CONFLICT (object_key, chunk_index) DO UPDATE SET data = excluded.data`)
    },
    async getChunkB64(key, index) {
      const row = await one<{ data: string }>(
        sql`SELECT data FROM ${sql.raw(chunks)} WHERE object_key = ${key} AND chunk_index = ${index}`,
      )
      return row ? String(row.data) : null
    },
    async countChunks(key) {
      const row = await one<{ n: number | string }>(
        sql`SELECT COUNT(*) AS n FROM ${sql.raw(chunks)} WHERE object_key = ${key}`,
      )
      return Number(row?.n ?? 0)
    },
    async deleteChunks(key) {
      await run(sql`DELETE FROM ${sql.raw(chunks)} WHERE object_key = ${key}`)
    },
    async listManifests(ns, prefix, limit) {
      const pattern = `${ns}/${escapeLike(prefix)}%`
      return all<ManifestRow>(
        sql`SELECT object_key, content_type, total_size, chunk_size, chunk_count, status, created_at, updated_at FROM ${sql.raw(files)}
WHERE object_key LIKE ${pattern} ESCAPE '\\' AND status = 'complete'
ORDER BY created_at DESC LIMIT ${limit}`,
      )
    },
    async findStaleUploading(beforeMs, limit) {
      return all<ManifestRow>(
        sql`SELECT object_key, content_type, total_size, chunk_size, chunk_count, status, created_at, updated_at FROM ${sql.raw(files)}
WHERE status = 'uploading' AND updated_at < ${beforeMs} LIMIT ${limit}`,
      )
    },
  }

  return defineChunkedStore(ops, o)
}

// ── REST 方言（qw-pages / PostgREST）──

interface ChunkRow {
  object_key: string
  chunk_index: number
  data: string
  [column: string]: unknown
}

export function createRestFileStore(rest: RestDb, opts: DbFileStoreOptions = {}): ChunkedFileStorage {
  const o = normalizeOpts(opts)
  const files = rest.table<ManifestRow>(o.table)
  const chunks = rest.table<ChunkRow>(o.chunkTable)
  const MANIFEST_COLS =
    'object_key,content_type,total_size,chunk_size,chunk_count,status,created_at,updated_at'

  const ops: StoreOps = {
    async upsertManifest(r) {
      await files.insert(r, { upsertOn: 'object_key' })
    },
    async getManifestRow(key) {
      const rows = await files.select({ object_key: key }, { columns: MANIFEST_COLS, limit: 1 })
      return rows[0] ?? null
    },
    async setManifestStatus(key, status, updatedAt) {
      await files.update({ status, updated_at: updatedAt } as Partial<ManifestRow>, { object_key: key })
    },
    async deleteManifest(key) {
      await files.remove({ object_key: key })
    },
    async upsertChunk(key, index, b64) {
      await chunks.insert(
        { object_key: key, chunk_index: index, data: b64 },
        { upsertOn: 'object_key,chunk_index' },
      )
    },
    async getChunkB64(key, index) {
      const rows = await chunks.select(
        { object_key: key, chunk_index: index },
        { columns: 'data', limit: 1 },
      )
      const row = rows[0]
      return row ? String(row.data) : null
    },
    async countChunks(key) {
      // RestDb 无 COUNT 聚合：只选 chunk_index 轻量列再计数（块数有限，可接受）
      const rows = await chunks.select({ object_key: key }, { columns: 'chunk_index' })
      return rows.length
    },
    async deleteChunks(key) {
      await chunks.remove({ object_key: key })
    },
    async listManifests(ns, prefix, limit) {
      return files.select(
        { object_key: { op: 'like', value: `${ns}/${prefix}*` }, status: 'complete' },
        { columns: MANIFEST_COLS, order: 'created_at.desc', limit },
      )
    },
    async findStaleUploading(beforeMs, limit) {
      return files.select(
        { status: 'uploading', updated_at: { op: 'lt', value: beforeMs } },
        { columns: MANIFEST_COLS, limit },
      )
    },
  }

  return defineChunkedStore(ops, o)
}
