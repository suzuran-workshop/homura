/**
 * PostgREST 版 UserStore —— qw-pages（dialect=rest）形态用。
 * 与 Drizzle 版（./user-store.ts）接口完全一致，SessionManager/Provider 不感知差异。
 *
 * ⚠ 表与 RLS policy 须由部署期受控迁移创建。
 * ⚠ 列名 = PG 真实列名（snake_case），与 tables.ts 严格对齐。
 */
import { randomUUID } from 'node:crypto'
import type { RestDb } from '@homurajs/db'
import type { LocalUser, UserStore } from './types.js'

export const USERS_TABLE = 'users'

interface UserRow {
  id: string
  username: string | null
  nickname: string | null
  avatar_url: string | null
  created_at: number | string
  updated_at: number | string
  [column: string]: unknown
}

function toUser(row: UserRow): LocalUser {
  return {
    id: row.id,
    username: row.username,
    nickname: row.nickname,
    avatarUrl: row.avatar_url,
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  }
}

export interface RestUserStoreOptions {
  table?: string
  now?: () => number
}

export function createRestUserStore(rest: RestDb, opts: RestUserStoreOptions = {}): UserStore {
  const t = rest.table<UserRow>(opts.table ?? USERS_TABLE)
  const now = opts.now ?? (() => Date.now())

  return {
    async findById(id) {
      const rows = await t.select({ id }, { limit: 1 })
      const row = rows[0]
      return row ? toUser(row) : null
    },

    async findByUsername(username) {
      const rows = await t.select({ username }, { limit: 1 })
      const row = rows[0]
      return row ? toUser(row) : null
    },

    async create(input) {
      const id = randomUUID()
      const ts = now()
      const inserted = await t.insert({
        id,
        username: input.username ?? null,
        nickname: input.nickname ?? null,
        avatar_url: input.avatarUrl ?? null,
        created_at: ts,
        updated_at: ts,
      })
      const row = inserted[0]
      if (!row) throw new Error('insert failed')
      return toUser(row)
    },

    async update(id, patch) {
      const ts = now()
      const updated = await t.update(
        {
          ...(patch.nickname !== undefined ? { nickname: patch.nickname } : {}),
          ...(patch.avatarUrl !== undefined ? { avatar_url: patch.avatarUrl } : {}),
          updated_at: ts,
        },
        { id },
      )
      const row = updated[0]
      if (!row) throw new Error('user 不存在: ' + id)
      return toUser(row)
    },

    async delete(id) {
      await t.remove({ id })
    },
  }
}
