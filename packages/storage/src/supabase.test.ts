import { describe, expect, it, vi } from 'vitest'
import { createSupabaseStorage } from './supabase.js'

function stubFetch() {
  const calls: Array<{ url: string; init: RequestInit }> = []
  const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} })
    return new Response('{"signedURL":"/object/sign/b/k?token=t"}', {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  })
  return { calls, fetchImpl }
}

describe('createSupabaseStorage（REST 契约快照）', () => {
  it('upload：POST /storage/v1/object/{bucket}/{key}，Bearer+apikey+x-upsert', async () => {
    const { calls, fetchImpl } = stubFetch()
    const s = createSupabaseStorage({
      platformUrl: 'https://proj.supabase.co',
      apiKey: 'anon',
      bucket: 'b',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })
    const r = await s.uploadFileRaw('x/y.png', new Uint8Array([1]), 'image/png')
    const call = calls[0]!
    expect(call.url).toBe('https://proj.supabase.co/storage/v1/object/b/x/y.png')
    expect(call.init.method).toBe('POST')
    const headers = call.init.headers as Record<string, string>
    expect(headers['authorization']).toBe('Bearer anon')
    expect(headers['apikey']).toBe('anon')
    expect(headers['x-upsert']).toBe('true')
    expect(r.url).toBe('/files/x/y.png')
  })

  it('presign：POST sign 端点，拼完整 signed URL；失败降级代理路径', async () => {
    const { fetchImpl } = stubFetch()
    const s = createSupabaseStorage({
      platformUrl: 'https://proj.supabase.co',
      apiKey: 'k',
      bucket: 'b',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })
    await expect(s.getPresignedUrl('x/y', 120)).resolves.toBe(
      'https://proj.supabase.co/storage/v1/object/sign/b/k?token=t',
    )
    // 失败降级
    const fail = vi.fn(async () => new Response('', { status: 500 }))
    const s2 = createSupabaseStorage({
      platformUrl: 'https://p.co',
      apiKey: 'k',
      bucket: 'b',
      fetchImpl: fail as unknown as typeof fetch,
    })
    await expect(s2.getPresignedUrl('x/y', 60)).resolves.toBe('/files/x/y')
  })

  it('list：POST object/list，prefix 限 ns', async () => {
    const { calls, fetchImpl } = stubFetch()
    fetchImpl.mockImplementationOnce(
      async (url: string | URL | Request, init?: RequestInit) => {
        calls.push({ url: String(url), init: init ?? {} })
        return new Response(
          JSON.stringify([
            { name: 'a.png', id: '1', metadata: { size: 5, mimetype: 'image/png', lastModified: '2026-01-01T00:00:00Z' } },
            { name: 'dir', id: null },
          ]),
          { status: 200 },
        )
      },
    )
    const s = createSupabaseStorage({
      platformUrl: 'https://p.co',
      apiKey: 'k',
      bucket: 'b',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })
    const files = await s.listFiles('ns', 'files/', 10)
    expect(calls[0]!.url).toBe('https://p.co/storage/v1/object/list/b')
    expect(JSON.parse(String(calls[0]!.init.body))).toMatchObject({ prefix: 'ns/files/', limit: 10 })
    expect(files).toHaveLength(1) // 目录条目（id null）被过滤
    expect(files[0]).toMatchObject({ objectKey: 'ns/files/a.png', size: 5 })
  })
})
