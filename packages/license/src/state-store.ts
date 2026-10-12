import type { NodeSQLiteDatabase } from 'drizzle-orm/node-sqlite'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import { pgCol, pgTable, sqliteCol, sqliteTable } from '@homura/db/schema-helpers'

export interface LicenseState {
  licenseId?: string
  instanceKey: string
}

export interface LicenseStateStore {
  load(): Promise<LicenseState | null>
  save(state: LicenseState): Promise<void>
}

/** license_state 单行表（id 恒为 'default'）——双方言表定义 + drizzle store */

export const pgLicenseTables = {
  licenseState: pgTable('license_state', {
    id: pgCol.text().primaryKey(),
    licenseId: pgCol.text(),
    instanceKey: pgCol.text().notNull(),
    updatedAt: pgCol.updatedAt(),
  }),
}

export const sqliteLicenseTables = {
  licenseState: sqliteTable('license_state', {
    id: sqliteCol.text().primaryKey(),
    licenseId: sqliteCol.text(),
    instanceKey: sqliteCol.text().notNull(),
    updatedAt: sqliteCol.updatedAt(),
  }),
}

export type DrizzleDb = PostgresJsDatabase<Record<string, never>> | NodeSQLiteDatabase<Record<string, never>>

export function createDrizzleStateStore(db: DrizzleDb): LicenseStateStore {
  throw new Error('NotImplemented: createDrizzleStateStore')
}
