/**
 * PostgREST 版 OAuth2LinkStore —— qw-pages（dialect=rest）形态用。
 * 与 Drizzle 版接口完全一致，identity resolver 不感知差异。
 *
 * ⚠ 表与 RLS policy 须由部署期受控迁移创建。
 * ⚠ 列名 = PG 真实列名（snake_case），与 tables.ts 严格对齐。
 */
import { randomUUID } from 'node:crypto'
import type { RestDb } from '@homurajs/db'
import type { IdentityLink, OAuth2LinkStore } from './types.js'

export const OAUTH2_IDENTITY_LINKS_TABLE = 'oauth2_identity_links'

interface LinkRow {
  id: string
  user_id: string
  provider: string
  provider_sub: string
  raw_profile: string | null
  created_at: number | string
  [column: string]: unknown
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

export interface RestOAuth2LinkStoreOptions {
  table?: string
  now?: () => number
}

export function createRestOAuth2LinkStore(
  rest: RestDb,
  opts: RestOAuth2LinkStoreOptions = {},
): OAuth2LinkStore {
  const t = rest.table<LinkRow>(opts.table ?? OAUTH2_IDENTITY_LINKS_TABLE)
  const now = opts.now ?? (() => Date.now())

  return {
    async findByProvider(provider, providerSub) {
      const rows = await t.select({ provider, provider_sub: providerSub }, { limit: 1 })
      const row = rows[0]
      return row ? toLink(row) : null
    },

    async findByUserId(userId) {
      const rows = await t.select({ user_id: userId })
      return rows.map(toLink)
    },

    async create(input) {
      const id = randomUUID()
      const ts = now()
      const inserted = await t.insert({
        id,
        user_id: input.userId,
        provider: input.provider,
        provider_sub: input.providerSub,
        raw_profile: input.rawProfile ?? null,
        created_at: ts,
      })
      const row = inserted[0]
      if (!row) throw new Error('insert failed')
      return toLink(row)
    },

    async delete(id) {
      await t.remove({ id })
    },
  }
}
