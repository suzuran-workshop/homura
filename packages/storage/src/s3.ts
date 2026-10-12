/**
 * s3 兼容后端（minio / aliyun-oss / 任意 S3 兼容端点）。
 * 可选依赖：@aws-sdk/client-s3 + @aws-sdk/s3-request-presigner。
 */
import type { FileStorage } from './index.js'

export interface S3StorageOptions {
  endpoint: string
  region: string
  bucket: string
  accessKeyId: string
  secretAccessKey: string
  /** 自举：bucket 不存在时创建 */
  autoCreateBucket?: boolean
}

export function createS3Storage(options: S3StorageOptions): FileStorage {
  throw new Error('NotImplemented: createS3Storage')
}
