import { describe, expect, it } from 'vitest'
import { DEFAULT_CLIENT_CHUNK_SIZE, downloadAsBlob, uploadChunked, uploadViaPresign } from './chunk-client.js'

/** 造一个 Blob（Node 18+ 全局有 Blob/File） */
function makeBlob(n: number, seed = 1): Blob {
  const out = new Uint8Array(n)
  let x = seed
  for (let i = 0; i < n; i++) {
    x = (x * 1103515245 + 12345) & 0x7fffffff
    out[i] = x & 0xff
  }
  return new Blob([out])
}

interface RecordedChunk {
  key: string
  index: number
  bytes: Uint8Array
}

/** 桩 fetch：模拟 init/chunk/complete 协议，记录每块原始字节 */
function stubFetch(opts: { chunkSize?: number } = {}) {
  const chunks: RecordedChunk[] = []
  const calls: Array<{ url: string; method: string }> = []
  const impl: typeof fetch = async (input, init) => {
    const url = String(input)
    const method = init?.method ?? 'GET'
    calls.push({ url, method })
    if (url.includes('/api/files/init')) {
      const body = JSON.parse(String(init?.body)) as { totalSize: number; chunkSize: number }
      const chunkSize = body.chunkSize
      const chunkCount = Math.max(1, Math.ceil(body.totalSize / chunkSize))
      return json({ objectKey: 'anon/files/x_bin', url: '/files/anon/files/x_bin', chunkCount, chunkSize })
    }
    if (url.includes('/api/files/chunk')) {
      const u = new URL(url, 'http://x')
      const key = u.searchParams.get('key')!
      const index = Number(u.searchParams.get('index'))
      const bytes = new Uint8Array((init?.body as ArrayBuffer) ?? new ArrayBuffer(0))
      chunks.push({ key, index, bytes })
      return json({ ok: true })
    }
    if (url.includes('/api/files/complete')) {
      return json({ manifest: { status: 'complete' } })
    }
    return json({ error: 'unexpected' }, 404)
  }
  return { impl, chunks, calls }
}

function json(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

describe('uploadChunked — 浏览器分块上传 SDK', () => {
  it('小文件（1 块）：init → 1 chunk → complete，返回 url', async () => {
    const { impl, chunks, calls } = stubFetch()
    const r = await uploadChunked(makeBlob(300), { fetchImpl: impl, chunkSize: 1024 })
    expect(r.url).toBe('/files/anon/files/x_bin')
    expect(r.chunkCount).toBe(1)
    expect(r.size).toBe(300)
    expect(chunks).toHaveLength(1)
    expect(chunks[0]!.bytes.byteLength).toBe(300)
    expect(calls.map((c) => c.url.split('?')[0])).toEqual([
      '/api/files/init',
      '/api/files/chunk',
      '/api/files/complete',
    ])
  })

  it('大文件（多块）：逐块切片正确、按 index 覆盖全部字节、拼接还原一致', async () => {
    const { impl, chunks } = stubFetch()
    const data = makeBlob(5000)
    const r = await uploadChunked(data, { fetchImpl: impl, chunkSize: 1024 })
    expect(r.chunkCount).toBe(5)
    expect(chunks).toHaveLength(5)
    // 按 index 排序后拼接应等于原文件
    const sorted = [...chunks].sort((a, b) => a.index - b.index)
    expect(sorted.map((c) => c.index)).toEqual([0, 1, 2, 3, 4])
    const total = sorted.reduce((n, c) => n + c.bytes.byteLength, 0)
    expect(total).toBe(5000)
    // 最后一块是余数（5000 - 4*1024 = 904）
    expect(sorted[4]!.bytes.byteLength).toBe(904)
    const joined = new Uint8Array(total)
    let off = 0
    for (const c of sorted) {
      joined.set(c.bytes, off)
      off += c.bytes.byteLength
    }
    const orig = new Uint8Array(await data.arrayBuffer())
    expect(Array.from(joined)).toEqual(Array.from(orig))
  })

  it('块 body 是原始字节（不 base64）：请求体大小 = raw 块大小', async () => {
    const { impl, chunks } = stubFetch()
    await uploadChunked(makeBlob(2048), { fetchImpl: impl, chunkSize: 1024 })
    // 每块 body 恰好 1024 原始字节（若 base64 会是 ~1368）
    expect(chunks[0]!.bytes.byteLength).toBe(1024)
    expect(chunks[1]!.bytes.byteLength).toBe(1024)
  })

  it('进度回调：loaded 单调递增到 total', async () => {
    const { impl } = stubFetch()
    const seen: Array<[number, number]> = []
    await uploadChunked(makeBlob(3000), {
      fetchImpl: impl,
      chunkSize: 1024,
      onProgress: (loaded, total) => seen.push([loaded, total]),
    })
    expect(seen.length).toBe(3)
    expect(seen[seen.length - 1]).toEqual([3000, 3000])
    const loadeds = seen.map((s) => s[0])
    expect(loadeds).toEqual([...loadeds].sort((a, b) => a - b)) // 单调不减
  })

  it('并发 >1：所有块仍恰好上传一次', async () => {
    const { impl, chunks } = stubFetch()
    await uploadChunked(makeBlob(5000), { fetchImpl: impl, chunkSize: 1024, concurrency: 3 })
    expect(chunks).toHaveLength(5)
    const idxs = chunks.map((c) => c.index).sort((a, b) => a - b)
    expect(idxs).toEqual([0, 1, 2, 3, 4])
  })

  it('某块失败 → 抛错（不静默吞）', async () => {
    const failAt = 2
    const impl: typeof fetch = async (input, init) => {
      const url = String(input)
      if (url.includes('/api/files/init')) {
        return json({ objectKey: 'k', url: '/files/k', chunkCount: 4, chunkSize: 1024 })
      }
      if (url.includes('/api/files/chunk')) {
        const index = Number(new URL(url, 'http://x').searchParams.get('index'))
        if (index === failAt) return json({ error: 'boom' }, 500)
        return json({ ok: true })
      }
      return json({ manifest: {} })
    }
    await expect(uploadChunked(makeBlob(4000), { fetchImpl: impl, chunkSize: 1024 })).rejects.toThrow(
      /分块 2 上传失败|HTTP 500/,
    )
  })

  it('缺省块大小 = 384KB', () => {
    expect(DEFAULT_CLIENT_CHUNK_SIZE).toBe(384 * 1024)
  })
})

describe('downloadAsBlob', () => {
  it('200 → 返回 Blob；非 200 → 抛错', async () => {
    const ok: typeof fetch = async () => new Response(new Uint8Array([1, 2, 3]), { status: 200 })
    const blob = await downloadAsBlob('/files/k', { fetchImpl: ok })
    expect(blob.size).toBe(3)
    const bad: typeof fetch = async () => new Response('nope', { status: 404 })
    await expect(downloadAsBlob('/files/k', { fetchImpl: bad })).rejects.toThrow(/下载失败 HTTP 404/)
  })
})

describe('uploadViaPresign — 预签名直传', () => {
  it('PUT Blob 到预签名 URL，带 content-type；200 通过', async () => {
    let seen: { method?: string; ct?: string; url?: string } = {}
    const impl: typeof fetch = async (input, init) => {
      seen = {
        method: init?.method,
        ct: new Headers(init?.headers).get('content-type') ?? undefined,
        url: String(input),
      }
      return new Response(null, { status: 200 })
    }
    const blob = new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' })
    await uploadViaPresign(blob, 'https://oss.example.com/b/k?sig=x', { fetchImpl: impl })
    expect(seen.method).toBe('PUT')
    expect(seen.url).toBe('https://oss.example.com/b/k?sig=x')
    expect(seen.ct).toBe('image/png') // 缺省用 file.type，须与签发时一致
  })

  it('显式 contentType 覆盖 file.type（须与签名一致）', async () => {
    let ct: string | null = null
    const impl: typeof fetch = async (_input, init) => {
      ct = new Headers(init?.headers).get('content-type')
      return new Response(null, { status: 200 })
    }
    await uploadViaPresign(new Blob([new Uint8Array([1])]), 'https://x/k', {
      fetchImpl: impl,
      contentType: 'application/octet-stream',
    })
    expect(ct).toBe('application/octet-stream')
  })

  it('非 2xx → 抛错', async () => {
    const impl: typeof fetch = async () => new Response('denied', { status: 403 })
    await expect(uploadViaPresign(new Blob([new Uint8Array([1])]), 'https://x/k', { fetchImpl: impl })).rejects.toThrow(
      /预签名直传失败 HTTP 403/,
    )
  })
})
