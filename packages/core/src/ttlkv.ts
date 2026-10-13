/**
 * TTL-KV 抽象：OAuth state 等「一次性消费」语义的最小存储。
 * 内存实现为缺省；多实例部署用 @homurajs/db 的 createDbTtlKv 兜底。
 */
import { randomBytes } from 'node:crypto'

export interface TtlKv {
  set(key: string, value: string, ttlMs: number): Promise<void>
  /** 一次性取出并删除（CSRF state 消费语义）；过期返回 null */
  take(key: string): Promise<string | null>
}

interface Entry {
  value: string
  expiresAt: number
}

export function createMemoryTtlKv(options?: { maxEntries?: number }): TtlKv {
  const maxEntries = options?.maxEntries ?? 10_000
  const store = new Map<string, Entry>()

  const sweep = (now: number): void => {
    for (const [k, e] of store) {
      if (e.expiresAt <= now) store.delete(k)
    }
  }

  return {
    async set(key, value, ttlMs) {
      const now = Date.now()
      if (store.size >= maxEntries) sweep(now)
      if (store.size >= maxEntries) {
        // 清扫后仍满：淘汰最旧条目（Map 迭代序 = 插入序）
        const oldest = store.keys().next().value
        if (oldest !== undefined) store.delete(oldest)
      }
      store.set(key, { value, expiresAt: now + ttlMs })
    },
    async take(key) {
      const entry = store.get(key)
      if (!entry) return null
      store.delete(key)
      if (entry.expiresAt <= Date.now()) return null
      return entry.value
    },
  }
}

/** 加密随机串（base64url），state/token 生成用 */
export function randomToken(bytes: number): string {
  return randomBytes(bytes).toString('base64url')
}
