/**
 * PostgREST 版 LicenseStateStore —— qw-pages（dialect=rest）形态用。
 *
 * 与 drizzle 版（./state-store.ts）的差异只有一处且是本质的：
 * drizzle 版在构造时 `CREATE TABLE IF NOT EXISTS`，REST 版**不能建表**
 * （App 无 DDL 权限，平台受控迁移角色才有），故表必须由部署期迁移预先创建，
 * 缺表/缺 policy 时由 RestError 的 hint 指出（42501 / 404）。
 *
 * save 用 upsert：POST + `?on_conflict=id` + `Prefer: resolution=merge-duplicates`，
 * 与 SQL 版 `ON CONFLICT (id) DO UPDATE` 等价。
 *
 * ⚠ 列名显式 snake_case（见 ./tables.ts）：id / license_id / instance_key / updated_at。
 */
import type { RestDb } from '@homurajs/db'
import type { LicenseState, LicenseStateStore } from './state-store.js'

export const LICENSE_STATE_TABLE = 'license_state'
/** 单行表，id 恒为此值（与 drizzle 版一致） */
export const LICENSE_STATE_ROW_ID = 'default'

interface LicenseStateRow {
  id: string
  license_id: string | null
  instance_key: string
  updated_at: number | string
  [column: string]: unknown
}

export interface RestStateStoreOptions {
  table?: string
  now?: () => number
}

export function createRestStateStore(
  rest: RestDb,
  opts: RestStateStoreOptions = {},
): LicenseStateStore {
  const t = rest.table<LicenseStateRow>(opts.table ?? LICENSE_STATE_TABLE)
  const now = opts.now ?? (() => Date.now())

  return {
    async load(): Promise<LicenseState | null> {
      const rows = await t.select(
        { id: LICENSE_STATE_ROW_ID },
        { columns: 'license_id,instance_key', limit: 1 },
      )
      const row = rows[0]
      if (!row) return null
      return { licenseId: row.license_id ?? undefined, instanceKey: row.instance_key }
    },

    async save(state: LicenseState): Promise<void> {
      await t.insert(
        {
          id: LICENSE_STATE_ROW_ID,
          license_id: state.licenseId ?? null,
          instance_key: state.instanceKey,
          updated_at: Math.floor(now() / 1000),
        },
        { upsertOn: 'id' },
      )
    },
  }
}
