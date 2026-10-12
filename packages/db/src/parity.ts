/**
 * 双方言 parity 硬门禁：用 drizzle 表元数据比对 pg/sqlite 两侧的
 * 表名/列名/主键，不一致抛错。
 * App 在测试里对自己全部 schema 调用，锁一致性防漂移。
 */
import { is } from 'drizzle-orm'
import { getTableName } from 'drizzle-orm'
import { getTableConfig as pgTableConfig, PgTable } from 'drizzle-orm/pg-core'
import {
  getTableConfig as sqliteTableConfig,
  SQLiteTable,
} from 'drizzle-orm/sqlite-core'

interface TableFingerprint {
  columns: string[]
  primaryKeys: string[]
}

function fingerprintPg(table: PgTable): TableFingerprint {
  const config = pgTableConfig(table)
  return {
    columns: config.columns.map((c) => c.name).sort(),
    // 列级主键标记在 column.primary；表级 primaryKeys 收 composite builder
    primaryKeys: [
      ...config.columns.filter((c) => c.primary).map((c) => c.name),
      ...config.primaryKeys.flatMap((pk) => pk.columns.map((c) => c.name)),
    ].sort(),
  }
}

function fingerprintSqlite(table: SQLiteTable): TableFingerprint {
  const config = sqliteTableConfig(table)
  return {
    columns: config.columns.map((c) => c.name).sort(),
    primaryKeys: [
      ...config.columns.filter((c) => c.primary).map((c) => c.name),
      ...config.primaryKeys.flatMap((pk) => pk.columns.map((c) => c.name)),
    ].sort(),
  }
}

export function assertSchemaParity(
  pgSchema: Record<string, unknown>,
  sqliteSchema: Record<string, unknown>,
): void {
  const pgKeys = Object.keys(pgSchema).sort()
  const sqliteKeys = Object.keys(sqliteSchema).sort()

  const onlyPg = pgKeys.filter((k) => !sqliteKeys.includes(k))
  const onlySqlite = sqliteKeys.filter((k) => !pgKeys.includes(k))
  if (onlyPg.length > 0 || onlySqlite.length > 0) {
    throw new Error(
      `双方言 schema 表集合不一致：仅 pg 侧有 [${onlyPg.join(', ')}]，仅 sqlite 侧有 [${onlySqlite.join(', ')}]`,
    )
  }

  const errors: string[] = []
  for (const key of pgKeys) {
    const pgTable = pgSchema[key]
    const sqliteTable = sqliteSchema[key]
    if (!pgTable || !sqliteTable) continue

    if (!is(pgTable, PgTable)) {
      errors.push(`${key}: pg 侧不是 pg-core 表（检查 import 来源）`)
      continue
    }
    if (!is(sqliteTable, SQLiteTable)) {
      errors.push(`${key}: sqlite 侧不是 sqlite-core 表（检查 import 来源）`)
      continue
    }

    const pgFp = fingerprintPg(pgTable)
    const sqliteFp = fingerprintSqlite(sqliteTable)

    if (getTableName(pgTable) !== getTableName(sqliteTable)) {
      errors.push(
        `${key}: 表名不一致（pg=${getTableName(pgTable)}, sqlite=${getTableName(sqliteTable)}）`,
      )
    }
    const colDiff = [
      ...pgFp.columns.filter((c) => !sqliteFp.columns.includes(c)).map((c) => `仅pg有列 ${c}`),
      ...sqliteFp.columns.filter((c) => !pgFp.columns.includes(c)).map((c) => `仅sqlite有列 ${c}`),
    ]
    if (colDiff.length > 0) errors.push(`${key}: ${colDiff.join('; ')}`)
    if (pgFp.primaryKeys.join(',') !== sqliteFp.primaryKeys.join(',')) {
      errors.push(
        `${key}: 主键不一致（pg=[${pgFp.primaryKeys.join(',')}], sqlite=[${sqliteFp.primaryKeys.join(',')}]）`,
      )
    }
  }

  if (errors.length > 0) {
    throw new Error(`双方言 schema parity 校验失败：\n  - ${errors.join('\n  - ')}`)
  }
}
