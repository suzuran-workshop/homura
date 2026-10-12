import { describe, expect, it } from 'vitest'
import { createS3Storage } from './s3.js'

/** 本地无 minio 时跳过；CI 通过 S3_TEST_ENDPOINT 环境变量启用（services: minio） */
const endpoint = process.env['S3_TEST_ENDPOINT']
const d = endpoint ? describe : describe.skip

d('createS3Storage（真实 minio）', () => {
  const storage = createS3Storage({
    endpoint: endpoint!,
    region: 'us-east-1',
    bucket: `homura-test-${Date.now()}`,
    accessKeyId: process.env['S3_TEST_ACCESS_KEY'] ?? 'minioadmin',
    secretAccessKey: process.env['S3_TEST_SECRET_KEY'] ?? 'minioadmin',
  })

  it('bucket 自举 + 上传下载删除往返 + 列举', async () => {
    const r = await storage.uploadFile('ns', 'a.txt', new Uint8Array([7, 7, 7]), 'text/plain')
    expect(r.url).toBe(`/files/${r.objectKey}`)

    const dl = await storage.downloadFile(r.objectKey)
    expect(Array.from(dl.data)).toEqual([7, 7, 7])

    const listed = await storage.listFiles('ns', '', 10)
    expect(listed.some((f) => f.objectKey === r.objectKey)).toBe(true)

    await storage.deleteFile(r.objectKey)
    await expect(storage.downloadFile(r.objectKey)).rejects.toThrow()
  })

  it('presign 默认降级代理路径', async () => {
    const r = await storage.uploadFileRaw('p/q.bin', new Uint8Array([1]), 'application/bin')
    await expect(storage.getPresignedUrl(r.objectKey, 60)).resolves.toBe(`/files/${r.objectKey}`)
  })
})
