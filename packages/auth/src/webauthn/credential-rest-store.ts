/**
 * PostgREST 版 WebauthnCredentialStore —— qw-pages（dialect=rest）形态用。
 *
 * ⚠ 表与 RLS policy 须由部署期受控迁移创建。
 * ⚠ 列名 = PG 真实列名（snake_case），与 tables.ts 严格对齐。
 */
import type { RestDb } from '@homurajs/db'
import type { WebauthnCredentialRecord } from '../identity/types.js'
import type { WebauthnCredentialStore } from './credential-store.js'

export const WEBAUTHN_CREDENTIALS_TABLE = 'webauthn_credentials'

interface CredRow {
  id: string
  user_id: string
  public_key: string
  counter: number | string
  device_type: string
  backed_up: number | string
  transports: string | null
  display_name: string | null
  created_at: number | string
  [column: string]: unknown
}

function toRecord(row: CredRow): WebauthnCredentialRecord {
  return {
    id: row.id,
    userId: row.user_id,
    publicKey: row.public_key,
    counter: Number(row.counter),
    deviceType: row.device_type,
    backedUp: Number(row.backed_up),
    transports: row.transports,
    displayName: row.display_name,
    createdAt: Number(row.created_at),
  }
}

export interface RestWebauthnCredentialStoreOptions {
  table?: string
  now?: () => number
}

export function createRestWebauthnCredentialStore(
  rest: RestDb,
  opts: RestWebauthnCredentialStoreOptions = {},
): WebauthnCredentialStore {
  const t = rest.table<CredRow>(opts.table ?? WEBAUTHN_CREDENTIALS_TABLE)
  const now = opts.now ?? (() => Date.now())

  return {
    async findById(id) {
      const rows = await t.select({ id }, { limit: 1 })
      const row = rows[0]
      return row ? toRecord(row) : null
    },

    async findByUserId(userId) {
      const rows = await t.select({ user_id: userId })
      return rows.map(toRecord)
    },

    async create(input) {
      const ts = now()
      const inserted = await t.insert({
        id: input.id,
        user_id: input.userId,
        public_key: input.publicKey,
        counter: input.counter,
        device_type: input.deviceType,
        backed_up: input.backedUp,
        transports: input.transports ?? null,
        display_name: input.displayName ?? null,
        created_at: ts,
      })
      const row = inserted[0]
      if (!row) throw new Error('insert failed')
      return toRecord(row)
    },

    async updateCounter(id, counter) {
      await t.update({ counter }, { id })
    },

    async delete(id) {
      await t.remove({ id })
    },
  }
}
