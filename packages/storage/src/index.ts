/**
 * 文件存储契约（自 Suzuran storage 适配器平移）：
 * - 租户/命名空间隔离编码在 key 前缀
 * - URL 统一走代理路径（/files/<key>），不直接暴露存储地址
 * - presign 优雅降级：弱后端返回代理路径
 */

export interface UploadResult {
  objectKey: string
  /** 平台相对代理路径（/files/<objectKey>） */
  url: string
  size: number
  uploadedAt: Date
}

export interface FileInfo {
  objectKey: string
  size: number
  updatedAt: Date
  contentType?: string
}

export interface FileStorage {
  /** 业务上传：自动生成 `<ns>/files/<unixNano>_<fileName>` 前缀 key */
  uploadFile(ns: string, fileName: string, data: FilePayload, contentType: string): Promise<UploadResult>
  /** 显式 key 上传（如 code.zip 等精确控制场景） */
  uploadFileRaw(objectKey: string, data: FilePayload, contentType: string): Promise<UploadResult>
  downloadFile(objectKey: string): Promise<{ data: Uint8Array; contentType?: string }>
  /** 弱后端降级为代理路径 */
  getPresignedUrl(objectKey: string, expirySeconds: number): Promise<string>
  /**
   * 预签名**上传** URL（浏览器直传对象存储用，绕开 App 网关的 body 上限）。
   * 可选能力：只有 s3 兼容后端实现；DB/local/supabase 不支持（返回 undefined 或抛错）。
   * 见 Phase B「预签名直传 OSS」。
   */
  getSignedUploadUrl?(
    objectKey: string,
    contentType: string,
    expirySeconds: number,
  ): Promise<string>
  deleteFile(objectKey: string): Promise<void>
  /** 强制 ns 前缀，无法越权列举 */
  listFiles(ns: string, prefix: string, limit: number): Promise<FileInfo[]>
}

/** 上传载荷（Node 侧 Uint8Array；浏览器 File/Blob 由调用方先转） */
export type FilePayload = Uint8Array | ReadableStream<Uint8Array>

/** object key 校验：禁止路径穿越 */
export function assertSafeObjectKey(key: string): void {
  if (key.includes('..') || key.startsWith('/') || key === '') {
    throw new Error(`unsafe object key: ${key}`)
  }
}

/** 统一代理路径 */
export function proxyUrl(objectKey: string): string {
  return `/files/${objectKey}`
}

/**
 * 生成业务 objectKey：`<ns>/files/<unixMs>_<safeName>`。
 * 服务端用它在分块上传 init 时定 key（强制 ns 前缀、清洗文件名），与整文件 uploadFile 同格式。
 */
export function generateObjectKey(ns: string, fileName: string, now: number): string {
  assertSafeObjectKey(ns)
  const safeName = fileName.replace(/[/\\]/g, '_')
  return `${ns}/files/${now}_${safeName}`
}
