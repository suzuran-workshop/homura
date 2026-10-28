/**
 * Directory Provisioning Resolver 单测 —— 目录白名单 JIT 骨架。
 *
 * 覆盖：目录命中建号准入、再次登录复用（provision 只调一次）、目录未命中拒绝、
 * provision 明确拒绝、provision 返回未知 userId、孤儿 link 清理后重新准入、
 * 并发首次登录竞态（以赢家 link 为准）。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { sql } from 'drizzle-orm'
import { createSqliteDb } from '@homurajs/db'
import { createDrizzleUserStore } from './user-store.js'
import { createDrizzleOidcLinkStore } from './oidc-link-store.js'
import { createDrizzleDirectoryStore } from './directory-store.js'
import {
  createDirectoryProvisioningResolver,
  ProvisionBlockedError,
} from './resolver.js'
import type { DirectoryProvisioningResolverOptions } from './resolver.js'
import type { DirectoryStore, OidcLinkStore, UserStore } from './types.js'

async function makeDb() {
  const db = createSqliteDb({ dialect: 'sqlite', path: ':memory:' })
  await db.run(sql.raw(
    `CREATE TABLE users (
      id TEXT PRIMARY KEY, username TEXT, nickname TEXT, avatar_url TEXT,
      created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
    )`,
  ))
  await db.run(sql.raw(`CREATE UNIQUE INDEX users_username_uidx ON users (username)`))
  await db.run(sql.raw(
    `CREATE TABLE oidc_identity_links (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL, provider TEXT NOT NULL,
      provider_sub TEXT NOT NULL, raw_profile TEXT, created_at INTEGER NOT NULL
    )`,
  ))
  await db.run(sql.raw(
    `CREATE UNIQUE INDEX oidc_links_provider_sub_uidx ON oidc_identity_links (provider, provider_sub)`,
  ))
  await db.run(sql.raw(
    `CREATE TABLE identity_directory (
      id TEXT PRIMARY KEY, provider TEXT NOT NULL, sub TEXT NOT NULL,
      name TEXT, raw TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
    )`,
  ))
  await db.run(sql.raw(
    `CREATE UNIQUE INDEX identity_directory_provider_sub_uidx ON identity_directory (provider, sub)`,
  ))
  return db
}

const PROVIDER = 'dingtalk'
const SUB = '025216385646-917635624'

let db: Awaited<ReturnType<typeof makeDb>>
let userStore: UserStore
let linkStore: OidcLinkStore
let directory: DirectoryStore

beforeEach(async () => {
  db = await makeDb()
  userStore = createDrizzleUserStore(db)
  linkStore = createDrizzleOidcLinkStore(db)
  directory = createDrizzleDirectoryStore(db)
})

/** 典型 App 策略：username=钉钉 userid 建号（幂等），返回 userId */
function jitProvisionSpy(users = userStore) {
  return vi.fn(async ({ sub, entry }: { sub: string; entry: { name: string | null } }) => {
    const existing = await users.findByUsername(sub)
    if (existing) return { userId: existing.id }
    const created = await users.create({ username: sub, nickname: entry.name })
    return { userId: created.id }
  })
}

function makeResolver(provision: DirectoryProvisioningResolverOptions['provision']) {
  return createDirectoryProvisioningResolver({ userStore, linkStore, directory, provision })
}

async function countUsers(): Promise<number> {
  const rows = (await db.all(sql.raw(`SELECT COUNT(*) AS n FROM users`))) as Array<{ n: number }>
  return Number(rows[0]?.n ?? 0)
}

describe('createDirectoryProvisioningResolver', () => {
  it('目录命中 → provision 建号 → 建 link → 返回新 user', async () => {
    await directory.upsert({ provider: PROVIDER, sub: SUB, name: '张三', raw: '{"dept":["数学组"]}' })
    const provision = jitProvisionSpy()
    const resolver = makeResolver(provision)

    const user = await resolver.resolve(PROVIDER, SUB, { nickname: '张三' })
    expect(user.username).toBe(SUB)
    expect(user.nickname).toBe('张三')
    const link = await linkStore.findByProvider(PROVIDER, SUB)
    expect(link?.userId).toBe(user.id)
    expect(provision).toHaveBeenCalledTimes(1)
    // 回调拿到目录条目与上游 profile
    const req = provision.mock.calls[0]?.[0]
    expect(req).toMatchObject({
      provider: PROVIDER,
      sub: SUB,
      entry: { name: '张三' },
      profile: { nickname: '张三' },
    })
  })

  it('再次登录 → link 命中复用同一 user，provision 不再调用', async () => {
    await directory.upsert({ provider: PROVIDER, sub: SUB, name: '张三' })
    const provision = jitProvisionSpy()
    const resolver = makeResolver(provision)
    const u1 = await resolver.resolve(PROVIDER, SUB, { nickname: '张三' })
    const u2 = await resolver.resolve(PROVIDER, SUB, { nickname: '张三' })
    expect(u2.id).toBe(u1.id)
    expect(provision).toHaveBeenCalledTimes(1)
    expect(await countUsers()).toBe(1)
  })

  it('目录未命中 → ProvisionBlockedError(not_in_directory)，不建户', async () => {
    const provision = jitProvisionSpy()
    const resolver = makeResolver(provision)
    const err = await resolver.resolve(PROVIDER, SUB, {}).catch((e) => e)
    expect(err).toBeInstanceOf(ProvisionBlockedError)
    expect((err as ProvisionBlockedError).reason).toBe('not_in_directory')
    expect(await countUsers()).toBe(0)
    expect(provision).not.toHaveBeenCalled()
  })

  it('provision 明确拒绝 → ProvisionBlockedError(declined)，不建 link', async () => {
    await directory.upsert({ provider: PROVIDER, sub: SUB, name: '张三' })
    const provision = vi.fn(async () => ({ declined: '不在任何校区' }))
    const resolver = makeResolver(provision)
    const err = await resolver.resolve(PROVIDER, SUB, {}).catch((e) => e)
    expect(err).toBeInstanceOf(ProvisionBlockedError)
    expect((err as ProvisionBlockedError).reason).toBe('declined')
    expect((err as ProvisionBlockedError).detail).toBe('不在任何校区')
    expect(await countUsers()).toBe(0)
    expect(await linkStore.findByProvider(PROVIDER, SUB)).toBeNull()
  })

  it('provision 返回未知 userId → ProvisionBlockedError(unknown_user)', async () => {
    await directory.upsert({ provider: PROVIDER, sub: SUB, name: '张三' })
    const provision = vi.fn(async () => ({ userId: 'ghost-user' }))
    const resolver = makeResolver(provision)
    const err = await resolver.resolve(PROVIDER, SUB, {}).catch((e) => e)
    expect(err).toBeInstanceOf(ProvisionBlockedError)
    expect((err as ProvisionBlockedError).reason).toBe('unknown_user')
    // 不留孤儿 link
    expect(await linkStore.findByProvider(PROVIDER, SUB)).toBeNull()
  })

  it('孤儿 link（user 被删）→ 清旧 link，重新走目录准入', async () => {
    await directory.upsert({ provider: PROVIDER, sub: SUB, name: '张三' })
    const provision = jitProvisionSpy()
    const resolver = makeResolver(provision)
    const u1 = await resolver.resolve(PROVIDER, SUB, {})
    await userStore.delete(u1.id)
    const u2 = await resolver.resolve(PROVIDER, SUB, {})
    expect(u2.id).not.toBe(u1.id)
    expect(u2.username).toBe(SUB)
    const link = await linkStore.findByProvider(PROVIDER, SUB)
    expect(link?.userId).toBe(u2.id)
  })

  it('幂等建号策略：两个目录身份各建一个账号，username 各为其 sub', async () => {
    await directory.upsert({ provider: PROVIDER, sub: SUB, name: '张三' })
    await directory.upsert({ provider: PROVIDER, sub: 'other-sub', name: '李四' })
    const provision = jitProvisionSpy()
    const resolver = makeResolver(provision)
    const u1 = await resolver.resolve(PROVIDER, SUB, {})
    expect(u1.username).toBe(SUB)
    const u2 = await resolver.resolve(PROVIDER, 'other-sub', {})
    expect(u2.username).toBe('other-sub')
    expect(await countUsers()).toBe(2)
  })

  it('并发首次登录竞态：create link 撞唯一约束 → 返回赢家 user', async () => {
    await directory.upsert({ provider: PROVIDER, sub: SUB, name: '张三' })
    // 预置赢家
    const winner = await userStore.create({ username: SUB, nickname: '张三' })
    await linkStore.create({ userId: winner.id, provider: PROVIDER, providerSub: SUB, rawProfile: null })

    const provision = vi.fn(async ({ sub }: { sub: string }) => {
      const existing = await userStore.findByUsername(sub)
      if (existing) return { userId: existing.id }
      const created = await userStore.create({ username: sub, nickname: '输家' })
      return { userId: created.id }
    })
    // 输家视角：查不到 link（竞态窗口），create 抛唯一冲突
    let findCalls = 0
    const racingLinkStore: OidcLinkStore = {
      ...linkStore,
      findByProvider: async (p, s) => {
        findCalls++
        if (findCalls === 1) return null
        return linkStore.findByProvider(p, s)
      },
      create: async () => {
        throw new Error('UNIQUE constraint failed: oidc_identity_links.provider, provider_sub')
      },
    }
    const resolver = createDirectoryProvisioningResolver({
      userStore,
      linkStore: racingLinkStore,
      directory,
      provision,
    })
    const resolved = await resolver.resolve(PROVIDER, SUB, { nickname: '输家' })
    expect(resolved.id).toBe(winner.id)
    expect(await countUsers()).toBe(1)
  })
})
