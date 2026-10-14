/**
 * Drizzle 双方言 OAuth2LinkStore —— oauth2_identity_links 表的 CRUD。
 * identity resolver 在 OAuth2 callback 时用 findByProvider 查已有 link，
 * JIT 模式时 create 新 link 并关联新建的 user。
 *
 * ⚠ 列名必须与 tables.ts 的显式 snake_case 对齐
 *   （id/user_id/provider/provider_sub/raw_profile/created_at）。
 */
import { randomUUID } from 'node:crypto'
import { sql } from 'drizzle-orm'
import { isSqlite } from '@homurajs/db'
import type { NodeSQLiteDatabase } from 'drizzle-orm/node-sqlite'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import type { IdentityLink, OAuth2LinkStore } from './types.js'

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

interface LinkRow {
  id: string
  user_id: string
  provider: string
  provider_sub: string
  raw_profile: string | null
  created_at: number | string
}

function toLink(row: LinkRow): IdentityLink {
  return {
    id: row.id,
    userId: row.user_id,
    provider: row.provider,
    providerSub: row.provider_sub,
    rawProfile: row.raw_profile,
    createdAt: Number(row.created_at),
  }
}

const SELECT_COLS = sql.raw('id, user_id, provider, provider_sub, raw_profile, created_at')

export function createDrizzleOAuth2LinkStore(
  db: DrizzleDb,
  opts?: { now?: () => number },
): OAuth2LinkStore {
  const now = opts?.now ?? (() => Date.now())

  return {
    async findByProvider(provider, providerSub) {
      const rows = await query<LinkRow>(
        db,
        sql`SELECT ${SELECT_COLS} FROM oauth2_identity_links
WHERE provider = ${provider} AND provider_sub = ${providerSub}`,
      )
      return rows[0] ? toLink(rows[0]) : null
    },

    async findByUserId(userId) {
      const rows = await query<LinkRow>(
        db,
        sql`SELECT ${SELECT_COLS} FROM oauth2_identity_links WHERE user_id = ${userId}`,
      )
      return rows.map(toLink)
    },

    async create(input) {
      const id = randomUUID()
      const ts = now()
      await exec(
        db,
        sql`INSERT INTO oauth2_identity_links (id, user_id, provider, provider_sub, raw_profile, created_at)
VALUES (${id}, ${input.userId}, ${input.provider}, ${input.providerSub}, ${input.rawProfile ?? null}, ${ts})`,
      )
      return {
        id,
        userId: input.userId,
        provider: input.provider,
        providerSub: input.providerSub,
        rawProfile: input.rawProfile ?? null,
        createdAt: ts,
      }
    },

    async delete(id) {
      await exec(db, sql`DELETE FROM oauth2_identity_links WHERE id = ${id}`)
    },
  }
}
