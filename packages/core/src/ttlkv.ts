/**
 * TTL-KV 抽象：OAuth state 等「一次性消费」语义的最小存储。
 * 内存实现为缺省；多实例部署用 @homura/db 的 createDbTtlKv 兜底。
 */
export interface TtlKv {
  set(key: string, value: string, ttlMs: number): Promise<void>
  /** 一次性取出并删除（CSRF state 消费语义） */
  take(key: string): Promise<string | null>
}

export function createMemoryTtlKv(options?: { maxEntries?: number }): TtlKv {
  throw new Error('NotImplemented: createMemoryTtlKv')
}

/** 加密随机串（base64url），state/token 生成用 */
export function randomToken(bytes: number): string {
  throw new Error('NotImplemented: randomToken')
}
