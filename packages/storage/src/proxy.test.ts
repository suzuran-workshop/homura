import { describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createLocalStorage } from './local.js'
import { createFileProxyRoutes } from './proxy.js'

describe('createFileProxyRoutes + local', () => {
  it('GET /files/<key> 返回内容与 contentType；404 处理', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'homura-proxy-'))
    try {
      const storage = createLocalStorage({ rootDir: dir })
      const { objectKey } = await storage.uploadFileRaw('img/a.png', new Uint8Array([1, 2]), 'image/png')
      const app = createFileProxyRoutes(storage)

      const ok = await app.request(`/files/${objectKey}`)
      expect(ok.status).toBe(200)
      expect(ok.headers.get('content-type')).toBe('image/png')
      expect(Array.from(new Uint8Array(await ok.arrayBuffer()))).toEqual([1, 2])

      const miss = await app.request('/files/img/none.png')
      expect(miss.status).toBe(404)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
