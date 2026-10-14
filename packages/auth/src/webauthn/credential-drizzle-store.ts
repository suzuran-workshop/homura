/**
 * Drizzle 双方言 WebauthnCredentialStore 实现。
 *
 * ⚠ 列名必须与 tables.ts 的显式 snake_case 对齐
 *   （id/user_id/public_key/counter/device_type/backed_up/transports/display_name/created_at）。
 */
import { sql } from 'drizzle-orm'
import { isSqlite } from '@homurajs/db'
import type { NodeSQLiteDatabase } from 'drizzle-orm/node-sqlite'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import type { WebauthnCredentialRecord } from '../identity/types.js'
import type { WebauthnCredentialStore } from './credential-store.js'

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

interface CredRow {
  id: string
  user_id: string
  public_key: string
  counter: number
  device_type: string
  backed_up: number
  transports: string | null
  display_name: string | null
  created_at: number | string
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

export function createDrizzleWebauthnCredentialStore(
  db: DrizzleDb,
  opts?: { now?: () => number },
): WebauthnCredentialStore {
  const now = opts?.now ?? (() => Date.now())

  return {
    async findById(id) {
      const rows = await query<CredRow>(
        db,
        sql`SELECT id, user_id, public_key, counter, device_type, backed_up, transports, display_name, created_at
FROM webauthn_credentials WHERE id = ${id}`,
      )
      return rows[0] ? toRecord(rows[0]) : null
    },

    async findByUserId(userId) {
      const rows = await query<CredRow>(
        db,
        sql`SELECT id, user_id, public_key, counter, device_type, backed_up, transports, display_name, created_at
FROM webauthn_credentials WHERE user_id = ${userId}`,
      )
      return rows.map(toRecord)
    },

    async create(input) {
      const ts = now()
      await exec(
        db,
        sql`INSERT INTO webauthn_credentials (id, user_id, public_key, counter, device_type, backed_up, transports, display_name, created_at)
VALUES (${input.id}, ${input.userId}, ${input.publicKey}, ${input.counter}, ${input.deviceType}, ${input.backedUp}, ${input.transports ?? null}, ${input.displayName ?? null}, ${ts})`,
      )
      return {
        id: input.id,
        userId: input.userId,
        publicKey: input.publicKey,
        counter: input.counter,
        deviceType: input.deviceType,
        backedUp: input.backedUp,
        transports: input.transports ?? null,
        displayName: input.displayName ?? null,
        createdAt: ts,
      }
    },

    async updateCounter(id, counter) {
      await exec(db, sql`UPDATE webauthn_credentials SET counter = ${counter} WHERE id = ${id}`)
    },

    async delete(id) {
      await exec(db, sql`DELETE FROM webauthn_credentials WHERE id = ${id}`)
    },
  }
}
