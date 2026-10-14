import { describe, expect, it, vi } from 'vitest'
import { createSqliteDb, type RestDb } from '@homurajs/db'
import {
  DEFAULT_CHUNK_SIZE,
  DEFAULT_MAX_TOTAL_BYTES,
  createDrizzleFileStore,
  createRestFileStore,
} from './db.js'
import { STORAGE_CHUNKS_TABLE, STORAGE_FILES_TABLE } from './tables.js'

const NOW = 1_700_000_000_123

/** 造 n 字节、内容可复现的二进制（含全字节范围，验证 base64 往返保真） */
function makeBytes(n: number, seed = 1): Uint8Array {
  const out = new Uint8Array(n)
  let x = seed
  for (let i = 0; i < n; i++) {
    x = (x * 1103515245 + 12345) & 0x7fffffff
    out[i] = x & 0xff
  }
  return out
}

async function readAll(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
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
  return out
}

describe('createDrizzleFileStore（sqlite 真库，:memory:）— 分块模型', () => {
  const newStore = (opts?: Parameters<typeof createDrizzleFileStore>[1]) =>
    createDrizzleFileStore(createSqliteDb({ dialect: 'sqlite', path: ':memory:' }), {
      now: () => NOW,
      sweepProbability: 0,
      ...opts,
    })

  it('小文件（1 块）uploadFileRaw → downloadFile 逐字节保真', async () => {
    const s = newStore({ chunkSize: 1024 })
    const data = makeBytes(300)
    await s.uploadFileRaw('imgs/a.png', data, 'image/png')
    const d = await s.downloadFile('imgs/a.png')
    expect(Array.from(d.data)).toEqual(Array.from(data))
    expect(d.contentType).toBe('image/png')
  })

  it('大文件（多块）round-trip 逐字节保真', async () => {
    const s = newStore({ chunkSize: 1024 })
    const data = makeBytes(5000) // 5 块（1024*4=4096 < 5000 ≤ 5120）
    const m = await s.getManifest('imgs/big.bin').then((x) => x) // null before upload
    expect(m).toBeNull()
    await s.uploadFileRaw('imgs/big.bin', data, 'application/octet-stream')
    const man = await s.getManifest('imgs/big.bin')
    expect(man?.chunkCount).toBe(5)
    expect(man?.status).toBe('complete')
    expect(man?.totalSize).toBe(5000)
    const d = await s.downloadFile('imgs/big.bin')
    expect(Array.from(d.data)).toEqual(Array.from(data))
  })

  it('分块协议：initUpload → putChunk×N → completeUpload', async () => {
    const s = newStore({ chunkSize: 1024 })
    const data = makeBytes(2500) // 3 块
    const { chunkCount, chunkSize } = await s.initUpload({
      objectKey: 'ns/f.bin',
      contentType: 'application/octet-stream',
      totalSize: data.byteLength,
    })
    expect(chunkCount).toBe(3)
    expect(chunkSize).toBe(1024)
    // 未完成前 getManifest 是 uploading，downloadFile 抛 not found
    expect((await s.getManifest('ns/f.bin'))?.status).toBe('uploading')
    await expect(s.downloadFile('ns/f.bin')).rejects.toThrow(/not found/)
    for (let i = 0; i < chunkCount; i++) {
      await s.putChunk('ns/f.bin', i, data.subarray(i * chunkSize, (i + 1) * chunkSize))
    }
    const done = await s.completeUpload('ns/f.bin')
    expect(done.status).toBe('complete')
    const d = await s.downloadFile('ns/f.bin')
    expect(Array.from(d.data)).toEqual(Array.from(data))
  })

  it('completeUpload 缺块 → 抛错（分块不齐）', async () => {
    const s = newStore({ chunkSize: 1024 })
    await s.initUpload({ objectKey: 'ns/p.bin', contentType: 'x', totalSize: 3000 })
    await s.putChunk('ns/p.bin', 0, makeBytes(1024))
    await expect(s.completeUpload('ns/p.bin')).rejects.toThrow(/分块不齐|1\/3/)
  })

  it('putChunk index 越界 → 抛错', async () => {
    const s = newStore({ chunkSize: 1024 })
    await s.initUpload({ objectKey: 'ns/x.bin', contentType: 'x', totalSize: 1024 })
    await expect(s.putChunk('ns/x.bin', 1, makeBytes(10))).rejects.toThrow(/越界/)
  })

  it('putChunk 未 init → 抛错', async () => {
    const s = newStore()
    await expect(s.putChunk('nope', 0, makeBytes(10))).rejects.toThrow(/not initialized/)
  })

  it('downloadStream 逐块产出、总长正确、内容保真', async () => {
    const s = newStore({ chunkSize: 1024 })
    const data = makeBytes(3000)
    await s.uploadFileRaw('ns/s.bin', data, 'application/octet-stream')
    const { stream, contentType, size } = await s.downloadStream('ns/s.bin')
    expect(contentType).toBe('application/octet-stream')
    expect(size).toBe(3000)
    const got = await readAll(stream)
    expect(Array.from(got)).toEqual(Array.from(data))
  })

  it('超过 maxTotalBytes → initUpload 拒（提示改用 s3）', async () => {
    const s = newStore({ maxTotalBytes: 2048, chunkSize: 1024 })
    await expect(
      s.initUpload({ objectKey: 'ns/big', contentType: 'x', totalSize: 4096 }),
    ).rejects.toThrow(/总上限|s3/)
  })

  it('deleteFile 清清单 + 分块；之后 download 抛 not found', async () => {
    const s = newStore({ chunkSize: 1024 })
    await s.uploadFileRaw('ns/d.bin', makeBytes(2500), 'x')
    await s.deleteFile('ns/d.bin')
    expect(await s.getManifest('ns/d.bin')).toBeNull()
    await expect(s.downloadFile('ns/d.bin')).rejects.toThrow(/not found/)
  })

  it('listFiles 只返 complete、按 ns 隔离', async () => {
    const s = newStore({ chunkSize: 1024 })
    await s.uploadFile('alice', 'a.txt', makeBytes(100), 'text/plain')
    await s.uploadFile('bob', 'b.txt', makeBytes(100), 'text/plain')
    await s.initUpload({ objectKey: 'alice/pending.bin', contentType: 'x', totalSize: 100 }) // uploading，不该出现
    const alice = await s.listFiles('alice', '', 50)
    expect(alice).toHaveLength(1)
    expect(alice[0]!.objectKey).toMatch(/^alice\/files\/\d+_a\.txt$/)
    expect(alice.some((f) => f.objectKey.includes('pending'))).toBe(false)
    expect(alice.some((f) => f.objectKey.startsWith('bob/'))).toBe(false)
  })

  it('残块 GC：stale uploading 被清扫（sweepProbability=1 + 时间推进）', async () => {
    let t = NOW
    const s = createDrizzleFileStore(createSqliteDb({ dialect: 'sqlite', path: ':memory:' }), {
      now: () => t,
      sweepProbability: 1,
      staleUploadMs: 1000,
      chunkSize: 1024,
    })
    await s.initUpload({ objectKey: 'ns/stale.bin', contentType: 'x', totalSize: 100 })
    expect((await s.getManifest('ns/stale.bin'))?.status).toBe('uploading')
    // 时间推进超过 staleUploadMs，再 init 一个触发 sweep
    t = NOW + 5000
    await s.initUpload({ objectKey: 'ns/fresh.bin', contentType: 'x', totalSize: 100 })
    expect(await s.getManifest('ns/stale.bin')).toBeNull() // 已被 GC
    expect((await s.getManifest('ns/fresh.bin'))?.status).toBe('uploading') // 新的还在
  })

  it('presign 降级为代理路径；路径穿越 key 被拒', async () => {
    const s = newStore()
    await expect(s.getPresignedUrl('x/y.png', 60)).resolves.toBe('/files/x/y.png')
    await expect(s.uploadFileRaw('../etc/passwd', makeBytes(10), 'x')).rejects.toThrow(/unsafe/)
  })

  it('缺省常量：块 384KB、总上限 50MB、表名', () => {
    expect(DEFAULT_CHUNK_SIZE).toBe(384 * 1024)
    expect(DEFAULT_MAX_TOTAL_BYTES).toBe(50 * 1024 * 1024)
    expect(STORAGE_FILES_TABLE).toBe('homura_files')
    expect(STORAGE_CHUNKS_TABLE).toBe('homura_file_chunks')
  })
})

describe('createRestFileStore（PostgREST 桩）— 分块模型', () => {
  interface Call {
    table: string
    op: string
    args: unknown[]
  }
  /** 按表名路由的桩：files 与 chunks 各有独立结果队列 */
  function stubRest(results: Record<string, { select?: unknown[][] }> = {}) {
    const calls: Call[] = []
    const queues: Record<string, Record<string, unknown[][]>> = {}
    const table = (name: string) => {
      const q = (queues[name] ??= { select: [], ...(results[name] ?? {}) })
      const make = (op: string) =>
        vi.fn(async (...args: unknown[]) => {
          calls.push({ table: name, op, args })
          return (q[op]?.shift() ?? []) as never
        })
      return { select: make('select'), insert: make('insert'), update: make('update'), remove: make('remove') }
    }
    const rest = { table, ping: vi.fn(async () => {}) } as unknown as RestDb
    return { rest, calls }
  }
  const manifestRow = (over: Partial<Record<string, unknown>> = {}) => ({
    object_key: 'ns/f.bin',
    content_type: 'application/octet-stream',
    total_size: 2500,
    chunk_size: 1024,
    chunk_count: 3,
    status: 'uploading',
    created_at: NOW,
    updated_at: NOW,
    ...over,
  })

  it('initUpload：写清单 status=uploading、chunk_count=ceil(total/chunk)', async () => {
    const { rest, calls } = stubRest()
    const s = createRestFileStore(rest, { now: () => NOW, sweepProbability: 0, chunkSize: 1024 })
    const r = await s.initUpload({ objectKey: 'ns/f.bin', contentType: 'application/octet-stream', totalSize: 2500 })
    expect(r).toEqual({ objectKey: 'ns/f.bin', chunkCount: 3, chunkSize: 1024 })
    const ins = calls.find((c) => c.table === STORAGE_FILES_TABLE && c.op === 'insert')!
    expect(ins.args[0]).toMatchObject({ object_key: 'ns/f.bin', status: 'uploading', chunk_count: 3, total_size: 2500 })
    expect(ins.args[1]).toEqual({ upsertOn: 'object_key' })
  })

  it('putChunk：base64 写入 chunks 表，复合 upsertOn', async () => {
    const { rest, calls } = stubRest({
      [STORAGE_FILES_TABLE]: { select: [[manifestRow()]] },
    })
    const s = createRestFileStore(rest, { now: () => NOW, sweepProbability: 0 })
    await s.putChunk('ns/f.bin', 1, new Uint8Array([1, 2, 3]))
    const ins = calls.find((c) => c.table === STORAGE_CHUNKS_TABLE && c.op === 'insert')!
    expect(ins.args[0]).toEqual({ object_key: 'ns/f.bin', chunk_index: 1, data: Buffer.from([1, 2, 3]).toString('base64') })
    expect(ins.args[1]).toEqual({ upsertOn: 'object_key,chunk_index' })
  })

  it('completeUpload：countChunks 齐 → setManifestStatus complete', async () => {
    const { rest, calls } = stubRest({
      [STORAGE_FILES_TABLE]: { select: [[manifestRow()]] },
      [STORAGE_CHUNKS_TABLE]: { select: [[{ chunk_index: 0 }, { chunk_index: 1 }, { chunk_index: 2 }]] },
    })
    const s = createRestFileStore(rest, { now: () => NOW, sweepProbability: 0 })
    const m = await s.completeUpload('ns/f.bin')
    expect(m.status).toBe('complete')
    const upd = calls.find((c) => c.table === STORAGE_FILES_TABLE && c.op === 'update')!
    expect(upd.args[0]).toMatchObject({ status: 'complete' })
    expect(upd.args[1]).toEqual({ object_key: 'ns/f.bin' })
  })

  it('completeUpload 缺块 → 抛错', async () => {
    const { rest } = stubRest({
      [STORAGE_FILES_TABLE]: { select: [[manifestRow()]] },
      [STORAGE_CHUNKS_TABLE]: { select: [[{ chunk_index: 0 }]] }, // 只有 1/3
    })
    const s = createRestFileStore(rest, { now: () => NOW, sweepProbability: 0 })
    await expect(s.completeUpload('ns/f.bin')).rejects.toThrow(/分块不齐/)
  })

  it('downloadStream：逐块 select data 列、base64 解码、按序拼接', async () => {
    const c0 = Buffer.from(makeBytes(1024)).toString('base64')
    const c1 = Buffer.from(makeBytes(500, 2)).toString('base64')
    const { rest, calls } = stubRest({
      [STORAGE_FILES_TABLE]: { select: [[manifestRow({ status: 'complete', chunk_count: 2, total_size: 1524 })]] },
      [STORAGE_CHUNKS_TABLE]: { select: [[{ data: c0 }], [{ data: c1 }]] },
    })
    const s = createRestFileStore(rest, { now: () => NOW, sweepProbability: 0 })
    const { stream, size } = await s.downloadStream('ns/f.bin')
    const got = await readAll(stream)
    expect(size).toBe(1524)
    expect(got.byteLength).toBe(1524)
    // 每块只选 data 列（不拉清单/多余列）
    const chunkSelects = calls.filter((c) => c.table === STORAGE_CHUNKS_TABLE && c.op === 'select')
    expect(chunkSelects.every((c) => (c.args[1] as { columns: string }).columns === 'data')).toBe(true)
  })

  it('listFiles：like + status=complete 过滤，只选元数据列（不含 data）', async () => {
    const { rest, calls } = stubRest({
      [STORAGE_FILES_TABLE]: { select: [[manifestRow({ status: 'complete' })]] },
    })
    const s = createRestFileStore(rest, { now: () => NOW, sweepProbability: 0 })
    const files = await s.listFiles('ns', 'f', 50)
    expect(files[0]).toMatchObject({ objectKey: 'ns/f.bin', size: 2500, contentType: 'application/octet-stream' })
    const sel = calls.find((c) => c.table === STORAGE_FILES_TABLE && c.op === 'select')!
    const filter = sel.args[0] as Record<string, unknown>
    expect(filter['status']).toBe('complete')
    expect(filter['object_key']).toEqual({ op: 'like', value: 'ns/f*' })
    expect((sel.args[1] as { columns: string }).columns).not.toContain('data')
  })

  it('超过 maxTotalBytes → 拒，且不写清单', async () => {
    const { rest, calls } = stubRest()
    const s = createRestFileStore(rest, { now: () => NOW, sweepProbability: 0, maxTotalBytes: 1024, chunkSize: 512 })
    await expect(s.initUpload({ objectKey: 'ns/big', contentType: 'x', totalSize: 4096 })).rejects.toThrow(/总上限/)
    expect(calls.some((c) => c.op === 'insert')).toBe(false)
  })
})
