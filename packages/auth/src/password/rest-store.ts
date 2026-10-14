/**
 * PostgREST 版 PasswordStore —— qw-pages（dialect=rest）形态用。
 *
 * ⚠ 表与 RLS policy 须由部署期受控迁移创建。
 * ⚠ 列名 = PG 真实列名（snake_case），与 tables.ts 严格对齐。
 */
import type { RestDb } from '@homurajs/db'
import type { PasswordRecord, PasswordStore } from './store.js'

export const PASSWORDS_TABLE = 'passwords'

interface PasswordRow {
  user_id: string
  password_hash: string
  created_at: number | string
  updated_at: number | string
  [column: string]: unknown
}

function toRecord(row: PasswordRow): PasswordRecord {
  return {
    userId: row.user_id,
    passwordHash: row.password_hash,
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  }
}

export interface RestPasswordStoreOptions {
  table?: string
  now?: () => number
}

export function createRestPasswordStore(
  rest: RestDb,
  opts: RestPasswordStoreOptions = {},
): PasswordStore {
  const t = rest.table<PasswordRow>(opts.table ?? PASSWORDS_TABLE)
  const now = opts.now ?? (() => Date.now())

  return {
    async findByUserId(userId) {
      const rows = await t.select({ user_id: userId }, { limit: 1 })
      const row = rows[0]
      return row ? toRecord(row) : null
    },

    async create(input) {
      const ts = now()
      const inserted = await t.insert({
        user_id: input.userId,
        password_hash: input.passwordHash,
        created_at: ts,
        updated_at: ts,
      })
      const row = inserted[0]
      if (!row) throw new Error('insert failed')
      return toRecord(row)
    },

    async updateHash(userId, passwordHash) {
      const ts = now()
      await t.update({ password_hash: passwordHash, updated_at: ts }, { user_id: userId })
    },

    async delete(userId) {
      await t.remove({ user_id: userId })
    },
  }
}
