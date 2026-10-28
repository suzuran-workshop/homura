/**
 * s3 兼容后端（minio / aliyun-oss / 任意 S3 兼容端点）。
 * 渐进式：AWS SDK 动态 import（方法体内），不用 s3 的 App 不安装 SDK 也能
 * 正常 typecheck/bundle 本包其余子路径。首次操作时惰性初始化（含 bucket 自举）。
 */
import type { S3Client as S3ClientType } from '@aws-sdk/client-s3'
import {
  assertSafeObjectKey,
  proxyUrl,
  type FileInfo,
  type FileStorage,
  type UploadResult,
} from './index.js'

export interface S3StorageOptions {
  endpoint: string
  region: string
  bucket: string
  accessKeyId: string
  secretAccessKey: string
  /** 自举：bucket 不存在时创建（默认 true） */
  autoCreateBucket?: boolean
  /** 预签名走直连 URL（默认 false：走代理路径降级，避免暴露 endpoint） */
  presignDirect?: boolean
  /**
   * 寻址风格：true = path-style（`endpoint/bucket/key`），false = virtual-hosted（`bucket.endpoint/key`）。
   * 缺省 true（minio 需要）。⚠ **阿里云 OSS 必须 false**：OSS 对对象操作强制 virtual-hosted，
   * path-style 会报 `403 SecondLevelDomainForbidden: Please use virtual hosted style`
   * （2026-10-14 真 OSS 实测）。预签名 URL 的寻址风格也随此开关，故直传前必须配对。
   */
  forcePathStyle?: boolean
}

/** 动态 import 的结构化形状（send/输出类型在调用点断言） */
interface S3Deps {
  S3Client: new (cfg: Record<string, unknown>) => S3ClientType
  PutObjectCommand: new (input: Record<string, unknown>) => object
  GetObjectCommand: new (input: Record<string, unknown>) => object
  DeleteObjectCommand: new (input: Record<string, unknown>) => object
  ListObjectsV2Command: new (input: Record<string, unknown>) => object
  HeadBucketCommand: new (input: Record<string, unknown>) => object
  CreateBucketCommand: new (input: Record<string, unknown>) => object
  getSignedUrl: (client: S3ClientType, cmd: object, opts: { expiresIn: number }) => Promise<string>
}

interface Sendable {
  send(cmd: object): Promise<unknown>
}

export function createS3Storage(options: S3StorageOptions): FileStorage {
  let ready: Promise<{ client: S3ClientType; deps: S3Deps }> | null = null

  async function init(): Promise<{ client: S3ClientType & Sendable; deps: S3Deps }> {
    const [clientMod, presignerMod] = await Promise.all([
      import('@aws-sdk/client-s3'),
      import('@aws-sdk/s3-request-presigner'),
    ])
    const deps = {
      S3Client: clientMod.S3Client,
      PutObjectCommand: clientMod.PutObjectCommand,
      GetObjectCommand: clientMod.GetObjectCommand,
      DeleteObjectCommand: clientMod.DeleteObjectCommand,
      ListObjectsV2Command: clientMod.ListObjectsV2Command,
      HeadBucketCommand: clientMod.HeadBucketCommand,
      CreateBucketCommand: clientMod.CreateBucketCommand,
      getSignedUrl: presignerMod.getSignedUrl,
    } as unknown as S3Deps
    const client = new deps.S3Client({
      endpoint: options.endpoint,
      region: options.region,
      forcePathStyle: options.forcePathStyle ?? true,
      credentials: {
        accessKeyId: options.accessKeyId,
        secretAccessKey: options.secretAccessKey,
      },
    })
    if (options.autoCreateBucket !== false) {
      try {
        await client.send(new deps.HeadBucketCommand({ Bucket: options.bucket }) as never)
      } catch {
        await client.send(new deps.CreateBucketCommand({ Bucket: options.bucket }) as never)
      }
    }
    return { client, deps }
  }

  function ensure(): Promise<{ client: S3ClientType & Sendable; deps: S3Deps }> {
    ready ??= init().catch((e) => {
      ready = null // 失败后允许重试
      throw e
    })
    return ready
  }

  const put = async (
    key: string,
    data: Uint8Array,
    contentType: string,
  ): Promise<UploadResult> => {
    assertSafeObjectKey(key)
    const { client, deps } = await ensure()
    await client.send(
      new deps.PutObjectCommand({
        Bucket: options.bucket,
        Key: key,
        Body: data,
        ContentType: contentType,
      }),
    )
    return { objectKey: key, url: proxyUrl(key), size: data.byteLength, uploadedAt: new Date() }
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
      const { client, deps } = await ensure()
      const res = (await client.send(
        new deps.GetObjectCommand({ Bucket: options.bucket, Key: objectKey }),
      )) as { Body?: { transformToByteArray(): Promise<Uint8Array> }; ContentType?: string }
      if (!res.Body) throw new Error(`s3 object missing body: ${objectKey}`)
      return {
        data: await res.Body.transformToByteArray(),
        contentType: res.ContentType,
      }
    },

    async getPresignedUrl(objectKey, expirySeconds) {
      if (!options.presignDirect) return proxyUrl(objectKey)
      const { client, deps } = await ensure()
      return deps.getSignedUrl(
        client,
        new deps.GetObjectCommand({ Bucket: options.bucket, Key: objectKey }),
        { expiresIn: expirySeconds },
      )
    },

    /**
     * 预签名**上传** URL（PUT）：浏览器拿到后直传对象存储，字节不过 App。
     * 这是大文件的正解——绕开 App 网关的 body 上限，也避免 DB 存 blob 的开销。
     * ⚠ 纯本地 SigV4 计算，不联网；但浏览器直传需对象存储侧配好 CORS（允许 App 域名的 PUT）。
     */
    async getSignedUploadUrl(objectKey, contentType, expirySeconds) {
      assertSafeObjectKey(objectKey)
      const { client, deps } = await ensure()
      return deps.getSignedUrl(
        client,
        new deps.PutObjectCommand({
          Bucket: options.bucket,
          Key: objectKey,
          ContentType: contentType,
        }),
        { expiresIn: expirySeconds },
      )
    },

    async deleteFile(objectKey) {
      const { client, deps } = await ensure()
      await client.send(new deps.DeleteObjectCommand({ Bucket: options.bucket, Key: objectKey }))
    },

    async listFiles(ns, prefix, limit): Promise<FileInfo[]> {
      assertSafeObjectKey(ns)
      const { client, deps } = await ensure()
      const res = (await client.send(
        new deps.ListObjectsV2Command({
          Bucket: options.bucket,
          Prefix: `${ns}/${prefix}`,
          MaxKeys: limit,
        }),
      )) as {
        Contents?: Array<{ Key?: string; Size?: number; LastModified?: Date }>
      }
      return (res.Contents ?? []).map((obj) => ({
        objectKey: obj.Key ?? '',
        size: obj.Size ?? 0,
        updatedAt: obj.LastModified ?? new Date(),
      }))
    },
  }
}

function toBytes(data: Uint8Array | ReadableStream<Uint8Array>): Uint8Array {
  if (data instanceof Uint8Array) return data
  throw new Error('s3 后端不支持流式载荷：请先聚合为 Uint8Array')
}
