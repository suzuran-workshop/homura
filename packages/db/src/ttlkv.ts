/**
 * DB 实现的 TTL-KV：多实例部署时 OAuth state 等的兜底存储。
 * take = DELETE ... RETURNING，双方言通用。
 */
import type { TtlKv } from '@homura/core'
import type { Database } from './types.js'

export function createDbTtlKv(db: Database): TtlKv {
  throw new Error('NotImplemented: createDbTtlKv')
}
