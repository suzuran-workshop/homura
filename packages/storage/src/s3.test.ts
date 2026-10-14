import { describe, expect, it } from 'vitest'
import { createS3Storage } from './s3.js'

/**
 * 预签名是**本地 SigV4 计算、不联网**（autoCreateBucket:false 时 init 也不碰网络），
 * 故这组测试无需 minio，本地即可跑——验证 OSS 兼容端点能正确产出 PUT/GET 预签名 URL。
 */
describe('createS3Storage — 预签名（离线 SigV4）', () => {
  const storage = createS3Storage({
    endpoint: 'https://oss-cn-hangzhou.aliyuncs.com',
    region: 'oss-cn-hangzhou',
    bucket: 'test-bucket',
    accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
    secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
    autoCreateBucket: false, // 关键：不触发 HeadBucket/CreateBucket 网络调用
  })

  it('getSignedUploadUrl 生成 PUT 预签名 URL（含 key/签名/有效期）', async () => {
    const url = await storage.getSignedUploadUrl!('ns/up.bin', 'application/octet-stream', 900)
    expect(url).toContain('test-bucket')
    expect(url).toContain('up.bin')
    expect(url).toContain('X-Amz-Signature=')
    expect(url).toContain('X-Amz-Expires=900')
    expect(url).toContain('X-Amz-Credential=')
  })

  it('getPresignedUrl 默认降级代理路径（presignDirect 未开）', async () => {
    await expect(storage.getPresignedUrl('ns/x.bin', 60)).resolves.toBe('/files/ns/x.bin')
  })

  it('路径穿越 key 被拒', async () => {
    await expect(storage.getSignedUploadUrl!('../etc/passwd', 'x', 60)).rejects.toThrow(/unsafe/)
  })
})

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
