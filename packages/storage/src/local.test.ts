import { describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createLocalStorage } from './local.js'

function withLocal<T>(fn: (storage: ReturnType<typeof createLocalStorage>) => Promise<T>): Promise<T> {
  const dir = mkdtempSync(join(tmpdir(), 'homura-store-'))
  const storage = createLocalStorage({ rootDir: dir })
  return fn(storage).finally(() => rmSync(dir, { recursive: true, force: true }))
}

describe('createLocalStorage', () => {
  it('uploadFile → ns 前缀 key + 代理 URL', () =>
    withLocal(async (s) => {
      const r = await s.uploadFile('org1', 'photo.png', new Uint8Array([1, 2, 3]), 'image/png')
      expect(r.objectKey).toMatch(/^org1\/files\/\d+_photo\.png$/)
      expect(r.url).toBe(`/files/${r.objectKey}`)
      expect(r.size).toBe(3)
    }))

  it('upload → download 往返（contentType 保留）', () =>
    withLocal(async (s) => {
      const r = await s.uploadFileRaw('a/b/c.bin', new Uint8Array([9, 9]), 'application/x-bin')
      const d = await s.downloadFile(r.objectKey)
      expect(Array.from(d.data)).toEqual([9, 9])
      expect(d.contentType).toBe('application/x-bin')
    }))

  it('download 不存在的 key 抛错', () =>
    withLocal(async (s) => {
      await expect(s.downloadFile('nope/missing')).rejects.toThrow(/not found/)
    }))

  it('路径穿越防护', () =>
    withLocal(async (s) => {
      await expect(
        s.uploadFileRaw('../escape', new Uint8Array([1]), 'text/plain'),
      ).rejects.toThrow(/unsafe object key/)
    }))

  it('presign 降级为代理路径', () =>
    withLocal(async (s) => {
      const r = await s.uploadFile('ns', 'f', new Uint8Array([1]), 'text/plain')
      await expect(s.getPresignedUrl(r.objectKey, 60)).resolves.toBe(`/files/${r.objectKey}`)
    }))

  it('listFiles 限 ns 前缀，不越权', () =>
    withLocal(async (s) => {
      await s.uploadFileRaw('nsA/files/x', new Uint8Array([1]), 'text/plain')
      await s.uploadFileRaw('nsB/files/x', new Uint8Array([1]), 'text/plain')
      const a = await s.listFiles('nsA', '', 10)
      expect(a.map((f) => f.objectKey)).toEqual(['nsA/files/x'])
    }))

  it('delete 后 download 抛错', () =>
    withLocal(async (s) => {
      const r = await s.uploadFileRaw('del/me', new Uint8Array([1]), 'text/plain')
      await s.deleteFile(r.objectKey)
      await expect(s.downloadFile('del/me')).rejects.toThrow()
    }))
})
