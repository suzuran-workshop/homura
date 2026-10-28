/**
 * Drizzle 双方言 DirectoryStore —— identity_directory 表的 CRUD。
 * App 同步上游身份来源（如钉钉通讯录）时用 upsert 写快照，
 * directory provisioning resolver 用 findByProviderAndSub 做白名单判定。
 *
 * ⚠ 列名必须与 tables.ts 的显式 snake_case 对齐
 *   （id/provider/sub/name/raw/created_at/updated_at）。
 */
import { randomUUID } from 'node:crypto'
import { sql } from 'drizzle-orm'
import { isSqlite } from '@homurajs/db'
import type { NodeSQLiteDatabase } from 'drizzle-orm/node-sqlite'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import type { DirectoryEntry, DirectoryStore } from './types.js'
import type { DrizzleDb } from './oauth2-link-store.js'

async function exec(db: DrizzleDb, q: ReturnType<typeof sql>): Promise<void> {
  if (isSqlite(db)) await db.run(q)
  else await db.execute(q as never)
}

async function query<T>(db: DrizzleDb, q: ReturnType<typeof sql>): Promise<T[]> {
  if (isSqlite(db)) return (await db.all(q as never)) as T[]
  const res = await db.execute(q as never)
  return (res as unknown as T[]) ?? []
}

interface DirectoryRow {
  id: string
  provider: string
  sub: string
  name: string | null
  raw: string | null
  created_at: number | string
  updated_at: number | string
}

function toEntry(row: DirectoryRow): DirectoryEntry {
  return {
    id: row.id,
    provider: row.provider,
    sub: row.sub,
    name: row.name,
    raw: row.raw,
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  }
}

const SELECT_COLS = sql.raw('id, provider, sub, name, raw, created_at, updated_at')

export function createDrizzleDirectoryStore(
  db: DrizzleDb,
  opts?: { now?: () => number },
): DirectoryStore {
  const now = opts?.now ?? (() => Date.now())

  return {
    async upsert(input) {
      const existing = await query<DirectoryRow>(
        db,
        sql`SELECT ${SELECT_COLS} FROM identity_directory
WHERE provider = ${input.provider} AND sub = ${input.sub}`,
      )
      const ts = now()
      if (existing[0]) {
        // 快照语义：last write wins
        await exec(
          db,
          sql`UPDATE identity_directory SET name = ${input.name ?? null}, raw = ${input.raw ?? null}, updated_at = ${ts}
WHERE provider = ${input.provider} AND sub = ${input.sub}`,
        )
        return toEntry({ ...existing[0], name: input.name ?? null, raw: input.raw ?? null, updated_at: ts })
      }
      const id = randomUUID()
      await exec(
        db,
        sql`INSERT INTO identity_directory (id, provider, sub, name, raw, created_at, updated_at)
VALUES (${id}, ${input.provider}, ${input.sub}, ${input.name ?? null}, ${input.raw ?? null}, ${ts}, ${ts})`,
      )
      return {
        id,
        provider: input.provider,
        sub: input.sub,
        name: input.name ?? null,
        raw: input.raw ?? null,
        createdAt: ts,
        updatedAt: ts,
      }
    },

    async findByProviderAndSub(provider, sub) {
      const rows = await query<DirectoryRow>(
        db,
        sql`SELECT ${SELECT_COLS} FROM identity_directory
WHERE provider = ${provider} AND sub = ${sub}`,
      )
      return rows[0] ? toEntry(rows[0]) : null
    },

    async listByProvider(provider) {
      const rows = await query<DirectoryRow>(
        db,
        sql`SELECT ${SELECT_COLS} FROM identity_directory WHERE provider = ${provider} ORDER BY created_at`,
      )
      return rows.map(toEntry)
    },

    async remove(provider, sub) {
      await exec(
        db,
        sql`DELETE FROM identity_directory WHERE provider = ${provider} AND sub = ${sub}`,
      )
    },
  }
}
