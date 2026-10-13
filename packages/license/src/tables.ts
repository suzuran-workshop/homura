/**
 * license_state 单行表（id 恒为 'default'）双方言定义。
 * App 把它 spread 进自己的 schema 参与迁移；createDrizzleStateStore 运行时
 * 也会 CREATE TABLE IF NOT EXISTS（幂等，二者不冲突）。
 *
 * ⚠ 列名显式 snake_case，必须与 state-store.ts 的原生 SQL 严格对齐
 *   （id/license_id/instance_key/updated_at）。
 */
import { pgCol, pgTable, sqliteCol, sqliteTable } from '@homurajs/db/schema-helpers'

export const pgLicenseTables = {
  licenseState: pgTable('license_state', {
    id: pgCol.text('id').primaryKey(),
    licenseId: pgCol.text('license_id'),
    instanceKey: pgCol.text('instance_key').notNull(),
    updatedAt: pgCol.int('updated_at').notNull().default(0),
  }),
}

export const sqliteLicenseTables = {
  licenseState: sqliteTable('license_state', {
    id: sqliteCol.text('id').primaryKey(),
    licenseId: sqliteCol.text('license_id'),
    instanceKey: sqliteCol.text('instance_key').notNull(),
    updatedAt: sqliteCol.int('updated_at').notNull().default(0),
  }),
}
