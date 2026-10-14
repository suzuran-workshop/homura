/**
 * Drizzle 双方言 UserStore —— users 表的 CRUD。
 * 复用 session/store.ts 的 exec/query 模式（isSqlite 分支 + 原生 SQL）。
 *
 * ⚠ 列名必须与 tables.ts 的显式 snake_case 对齐（id/username/nickname/avatar_url/created_at/updated_at）。
 */
import { randomUUID } from 'node:crypto'
import { sql } from 'drizzle-orm'
import { isSqlite } from '@homurajs/db'
import type { NodeSQLiteDatabase } from 'drizzle-orm/node-sqlite'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import type { LocalUser, UserStore } from './types.js'

export type DrizzleDb = PostgresJsDatabase | NodeSQLiteDatabase

async function exec(db: DrizzleDb, q: ReturnType<typeof sql>): Promise<void> {
  if (isSqlite(db)) await db.run(q)
  else await db.execute(q as never)
}

async function query<T>(db: DrizzleDb, q: ReturnType<typeof sql>): Promise<T[]> {
  if (isSqlite(db)) return (await db.all(q as never)) as T[]
  const res = await db.execute(q as never)
  return (res as unknown as T[]) ?? []
}

interface UserRow {
  id: string
  username: string | null
  nickname: string | null
  avatar_url: string | null
  created_at: number | string
  updated_at: number | string
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

export function createDrizzleUserStore(db: DrizzleDb, opts?: { now?: () => number }): UserStore {
  const now = opts?.now ?? (() => Date.now())

  return {
    async findById(id) {
      const rows = await query<UserRow>(db, sql`SELECT id, username, nickname, avatar_url, created_at, updated_at FROM users WHERE id = ${id}`)
      return rows[0] ? toUser(rows[0]) : null
    },

    async findByUsername(username) {
      const rows = await query<UserRow>(db, sql`SELECT id, username, nickname, avatar_url, created_at, updated_at FROM users WHERE username = ${username}`)
      return rows[0] ? toUser(rows[0]) : null
    },

    async create(input) {
      const id = randomUUID()
      const ts = now()
      await exec(
        db,
        sql`INSERT INTO users (id, username, nickname, avatar_url, created_at, updated_at)
VALUES (${id}, ${input.username ?? null}, ${input.nickname ?? null}, ${input.avatarUrl ?? null}, ${ts}, ${ts})`,
      )
      return {
        id,
        username: input.username ?? null,
        nickname: input.nickname ?? null,
        avatarUrl: input.avatarUrl ?? null,
        createdAt: ts,
        updatedAt: ts,
      }
    },

    async update(id, patch) {
      const ts = now()
      // 分支构建参数化 SQL，避免 raw 拼接
      if (patch.nickname !== undefined && patch.avatarUrl !== undefined) {
        await exec(
          db,
          sql`UPDATE users SET nickname = ${patch.nickname}, avatar_url = ${patch.avatarUrl}, updated_at = ${ts} WHERE id = ${id}`,
        )
      } else if (patch.nickname !== undefined) {
        await exec(db, sql`UPDATE users SET nickname = ${patch.nickname}, updated_at = ${ts} WHERE id = ${id}`)
      } else if (patch.avatarUrl !== undefined) {
        await exec(db, sql`UPDATE users SET avatar_url = ${patch.avatarUrl}, updated_at = ${ts} WHERE id = ${id}`)
      } else {
        await exec(db, sql`UPDATE users SET updated_at = ${ts} WHERE id = ${id}`)
      }
      const rows = await query<UserRow>(db, sql`SELECT id, username, nickname, avatar_url, created_at, updated_at FROM users WHERE id = ${id}`)
      if (!rows[0]) throw new Error('user 不存在: ' + id)
      return toUser(rows[0])
    },
  }
}
