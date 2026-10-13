/**
 * PostgREST 版 TTL-KV：ADR-010「多实例部署用 DB 实现兜底」在 qw-pages 形态的落地。
 *
 * Pages 上内存 KV 的真实风险（实测）：进程重启即清空、重发布必换实例；
 * 而 createDbTtlKv 走 drizzle + SQL，Pages 上没有 PG 连接可用 → 只能走 REST。
 *
 * 算子映射（均经线上实测）：
 * - set  = INSERT + `?on_conflict=key` + `Prefer: resolution=merge-duplicates`
 *          （唯一列非主键时不给 on_conflict 会 409/23505）
 * - take = DELETE + 过滤 + `Prefer: return=representation` → 返回被删行，
 *          与 SQL 版 `DELETE ... RETURNING` 语义一致，且天然「先占后判」（教训 8）
 *
 * 前置：`homura_ttlkv(key text primary key, value text not null, expires_at integer not null)`
 * 与 anon 的 RLS policy 必须由部署期的平台受控迁移创建——App 无 DDL 权限。
 */
import type { TtlKv } from '@homurajs/core'
import type { RestDb } from './postgrest.js'

export interface RestTtlKvRow {
  key: string
  value: string
  expires_at: number
  [column: string]: unknown
}

export const REST_TTLKV_TABLE = 'homura_ttlkv'

export interface RestTtlKvOptions {
  table?: string
  /** 顺带清扫过期项的概率（默认 0.05，与 SQL 版一致）；测试传 0 或 1 消除随机性 */
  sweepProbability?: number
}

export function createRestTtlKv(db: RestDb, opts: RestTtlKvOptions = {}): TtlKv {
  const table = db.table<RestTtlKvRow>(opts.table ?? REST_TTLKV_TABLE)
  const sweepProbability = opts.sweepProbability ?? 0.05
  const nowSec = (): number => Math.floor(Date.now() / 1000)

  return {
    async set(key, value, ttlMs) {
      if (Math.random() < sweepProbability) {
        await table.remove({ expires_at: { op: 'lte', value: nowSec() } })
      }
      await table.insert(
        { key, value, expires_at: Math.floor((Date.now() + ttlMs) / 1000) },
        { upsertOn: 'key' },
      )
    },

    async take(key) {
      const rows = await table.remove({ key, expires_at: { op: 'gt', value: nowSec() } })
      const hit = rows[0]
      return hit ? String(hit.value) : null
    },
  }
}
