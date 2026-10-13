/**
 * 从 pg schema 派生 PostgREST 表描述符 —— REST 形态**不写第三份 schema**。
 *
 * 为什么派生而不是按 ADR-003 再 colocated 一个 schema/rest.ts：
 * PostgREST 的列名就是 PG 的真实列名，手写第三份必然漂移（遗产教训 6 的翻版）。
 * 用 drizzle 表元数据反查，单一事实源仍是 schema/pg.ts。
 *
 * ⚠ 特别容易写错的一点：pgCol 配方在不传 name 时用 **JS 属性名**做 DB 列名，
 * 所以 todos 的真实列名是 camelCase 的 `ownerSub` / `createdAt`，不是 owner_sub / created_at；
 * 而 auth/license 那两张走原生 SQL 的表是显式 snake_case。派生能自动拿到正确列名，手写极易错。
 */
import { getTableName, is } from 'drizzle-orm'
import { PgTable, getTableConfig } from 'drizzle-orm/pg-core'

export interface RestTableDescriptor {
  /** PG 真实表名（PostgREST 路径用） */
  table: string
  /** PG 真实列名（PostgREST 的 select/过滤/排序用这些，不是 JS 属性名） */
  columns: string[]
  /** 主键列（upsert 缺省冲突目标；唯一列非主键时需另行指定 on_conflict） */
  primaryKeys: string[]
}

/** 单表派生；非 pg-core 表直接抛（fail fast，不静默给出空描述符） */
export function restTableFromPg(table: unknown): RestTableDescriptor {
  if (!is(table, PgTable)) {
    throw new Error(
      'restTableFromPg 只接受 drizzle pg-core 表（检查 import 来源是否为 schema/pg.js）',
    )
  }
  const config = getTableConfig(table)
  return {
    table: getTableName(table),
    columns: config.columns.map((c) => c.name),
    primaryKeys: [
      ...config.columns.filter((c) => c.primary).map((c) => c.name),
      ...config.primaryKeys.flatMap((pk) => pk.columns.map((c) => c.name)),
    ],
  }
}

/** 整个 schema 一次性派生（键名与 pg schema 保持一致） */
export function restSchemaFromPg(
  pgSchema: Record<string, unknown>,
): Record<string, RestTableDescriptor> {
  const out: Record<string, RestTableDescriptor> = {}
  for (const [key, table] of Object.entries(pgSchema)) {
    out[key] = restTableFromPg(table)
  }
  return out
}

/** 断言描述符含指定列，缺列时给出指向平台受控迁移的可行动错误 */
export function assertRestColumns(desc: RestTableDescriptor, required: readonly string[]): void {
  const missing = required.filter((c) => !desc.columns.includes(c))
  if (missing.length > 0) {
    throw new Error(
      `表 ${desc.table} 缺列 [${missing.join(', ')}]：` +
        '实际列 = ' +
        desc.columns.join(', ') +
        '。REST 形态的表由部署期的平台受控迁移创建，请用最新 drizzle/pg 迁移 SQL 重建（App 无 DDL 权限）',
    )
  }
}
