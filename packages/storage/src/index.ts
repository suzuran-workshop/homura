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
  /**
   * 流式下载（可选）：逐块 yield，避免整文件进内存。代理路由优先用它，缺失时退回 downloadFile。
   * 分块后端（ChunkedFileStorage）必须实现。
   */
  downloadStream?(
    objectKey: string,
  ): Promise<{ stream: ReadableStream<Uint8Array>; contentType: string; size: number }>
  deleteFile(objectKey: string): Promise<void>
  /** 强制 ns 前缀，无法越权列举 */
  listFiles(ns: string, prefix: string, limit: number): Promise<FileInfo[]>
}

/** 清单状态：uploading（分块上传中）| complete（块齐、可下载） */
export type FileStatus = 'uploading' | 'complete'

/** 分块文件的清单（manifest）——不含数据本身 */
export interface FileManifest {
  objectKey: string
  contentType: string
  /** 原始总字节数 */
  totalSize: number
  /** 每块原始字节数（最后一块可能更小） */
  chunkSize: number
  chunkCount: number
  status: FileStatus
  createdAt: Date
}

/**
 * 分块文件存储：在 FileStorage 之上加分块上传协议（init/putChunk/complete）。
 *
 * 为什么需要：qw-pages 网关对单请求 body 有上限（实测 ≥1MB 413），PostgREST 单值也 ~1MB。
 * 把文件切成 ≤chunkSize 的块、每块一个小请求，即可绕开限制支持大文件。前端用
 * `@homurajs/storage/chunk-client` 切片上传；下载由 `downloadStream` 逐块流式重组。
 *
 * 整文件 API（uploadFile/downloadFile）仍可用：内部自动分块/重组（服务端一次性场景）。
 */
export interface ChunkedFileStorage extends FileStorage {
  /** 初始化分块上传：建清单（status=uploading），返回实际块数与块大小 */
  initUpload(input: {
    objectKey: string
    contentType: string
    totalSize: number
    chunkSize?: number
  }): Promise<{ objectKey: string; chunkCount: number; chunkSize: number }>
  /** 写入单块（幂等 upsert，可重试/并行）；data 为该块原始字节 */
  putChunk(objectKey: string, index: number, data: Uint8Array): Promise<void>
  /** 完成上传：校验块齐 → status=complete；缺块抛错（残块由 GC 清） */
  completeUpload(objectKey: string): Promise<FileManifest>
  /** 读清单（不存在返回 null） */
  getManifest(objectKey: string): Promise<FileManifest | null>
  /** 流式下载（分块后端必须实现） */
  downloadStream(
    objectKey: string,
  ): Promise<{ stream: ReadableStream<Uint8Array>; contentType: string; size: number }>
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
