/**
 * Drizzle 双方言 PasswordStore 实现。
 *
 * ⚠ 列名必须与 tables.ts 的显式 snake_case 对齐
 *   （user_id/password_hash/created_at/updated_at）。
 */
import { sql } from 'drizzle-orm'
import { isSqlite } from '@homurajs/db'
import type { NodeSQLiteDatabase } from 'drizzle-orm/node-sqlite'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import type { PasswordRecord, PasswordStore } from './store.js'

export type DrizzleDb = PostgresJsDatabase | NodeSQLiteDatabase

async function exec(db: DrizzleDb, q: ReturnType<typeof sql>): Promise<void> {
  if (isSqlite(db)) await db.run(q)
  else await db.execute(q as never)
}

async function queryOne<T>(db: DrizzleDb, q: ReturnType<typeof sql>): Promise<T | null> {
  if (isSqlite(db)) {
    const rows = (await db.all(q as never)) as T[]
    return rows[0] ?? null
  }
  const res = (await db.execute(q as never)) as unknown as T[]
  return res?.[0] ?? null
}

interface PasswordRow {
  user_id: string
  password_hash: string
  created_at: number | string
  updated_at: number | string
}

function toRecord(row: PasswordRow): PasswordRecord {
  return {
    userId: row.user_id,
    passwordHash: row.password_hash,
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  }
}

export function createDrizzlePasswordStore(
  db: DrizzleDb,
  opts?: { now?: () => number },
): PasswordStore {
  const now = opts?.now ?? (() => Date.now())

  return {
    async findByUserId(userId) {
      const row = await queryOne<PasswordRow>(
        db,
        sql`SELECT user_id, password_hash, created_at, updated_at FROM passwords WHERE user_id = ${userId}`,
      )
      return row ? toRecord(row) : null
    },

    async create(input) {
      const ts = now()
      await exec(
        db,
        sql`INSERT INTO passwords (user_id, password_hash, created_at, updated_at)
VALUES (${input.userId}, ${input.passwordHash}, ${ts}, ${ts})`,
      )
      return { userId: input.userId, passwordHash: input.passwordHash, createdAt: ts, updatedAt: ts }
    },

    async updateHash(userId, passwordHash) {
      const ts = now()
      await exec(
        db,
        sql`UPDATE passwords SET password_hash = ${passwordHash}, updated_at = ${ts} WHERE user_id = ${userId}`,
      )
    },

    async delete(userId) {
      await exec(db, sql`DELETE FROM passwords WHERE user_id = ${userId}`)
    },
  }
}
