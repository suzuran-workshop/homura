/**
 * Identity Resolver 单测 —— IdP sub → local user 桥接。
 *
 * 覆盖：JIT 建户、再次登录复用同一 user、孤儿 link 清理、profile 回填、
 * JIT 关闭拒绝未知身份、JIT 关闭但已有 link 放行、并发首次登录竞态（#10）。
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { sql } from 'drizzle-orm'
import { createSqliteDb } from '@homurajs/db'
import { createDrizzleUserStore } from './user-store.js'
import { createDrizzleOidcLinkStore } from './oidc-link-store.js'
import { createDefaultIdentityResolver, IdentityNotLinkedError } from './resolver.js'
import type { OidcLinkStore, UserStore } from './types.js'

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
  return db
}

let db: Awaited<ReturnType<typeof makeDb>>
let userStore: UserStore
let linkStore: OidcLinkStore

const PROVIDER = 'dingtalk'
const SUB = 'idp-sub-1'

beforeEach(async () => {
  db = await makeDb()
  userStore = createDrizzleUserStore(db)
  linkStore = createDrizzleOidcLinkStore(db)
})

async function countUsers(): Promise<number> {
  const rows = (await db.all(sql.raw(`SELECT COUNT(*) AS n FROM users`))) as Array<{ n: number }>
  return Number(rows[0]?.n ?? 0)
}

describe('createDefaultIdentityResolver — JIT 开启（缺省）', () => {
  it('首次登录：无 link → 建户 + 建 link，返回新 user', async () => {
    const resolver = createDefaultIdentityResolver(userStore, linkStore)
    const user = await resolver.resolve(PROVIDER, SUB, { nickname: '张三', avatarUrl: 'http://a/p.png' })
    expect(user.id).toBeTruthy()
    expect(user.nickname).toBe('张三')
    expect(user.username).toBeNull() // 纯 OIDC 登录用户无 username
    // link 已建
    const link = await linkStore.findByProvider(PROVIDER, SUB)
    expect(link?.userId).toBe(user.id)
    expect(await countUsers()).toBe(1)
  })

  it('再次登录：命中已有 link → 返回同一 user，不重复建户', async () => {
    const resolver = createDefaultIdentityResolver(userStore, linkStore)
    const u1 = await resolver.resolve(PROVIDER, SUB, { nickname: '张三' })
    const u2 = await resolver.resolve(PROVIDER, SUB, { nickname: '张三' })
    expect(u2.id).toBe(u1.id)
    expect(await countUsers()).toBe(1)
  })

  it('profile 回填：本地 nickname 为空时用上游最新值补上', async () => {
    const resolver = createDefaultIdentityResolver(userStore, linkStore)
    const u1 = await resolver.resolve(PROVIDER, SUB, {}) // 首次无 nickname
    expect(u1.nickname).toBeNull()
    const u2 = await resolver.resolve(PROVIDER, SUB, { nickname: '李四' }) // 上游补了名字
    expect(u2.id).toBe(u1.id)
    expect(u2.nickname).toBe('李四')
  })

  it('孤儿 link（user 被删）→ 清掉旧 link 并重新 JIT 建户', async () => {
    const resolver = createDefaultIdentityResolver(userStore, linkStore)
    const u1 = await resolver.resolve(PROVIDER, SUB, { nickname: '张三' })
    // 删掉 user，留下孤儿 link
    await userStore.delete(u1.id)
    expect(await linkStore.findByProvider(PROVIDER, SUB)).not.toBeNull()
    // 再登录：应清孤儿 link 并建新户
    const u2 = await resolver.resolve(PROVIDER, SUB, { nickname: '张三' })
    expect(u2.id).not.toBe(u1.id)
    const link = await linkStore.findByProvider(PROVIDER, SUB)
    expect(link?.userId).toBe(u2.id)
  })

  it('并发首次登录竞态：create 撞唯一约束 → 清孤儿 user + 重读赢家 link（#10）', async () => {
    // 预置「赢家」：另一个并发请求已建好 user + link
    const winner = await userStore.create({ nickname: '赢家' })
    await linkStore.create({ userId: winner.id, provider: PROVIDER, providerSub: SUB, rawProfile: null })

    // 构造竞态 linkStore：第一次 findByProvider 返回 null（双方都没看到 link），
    // create 抛唯一冲突（输家），之后 findByProvider 能读到赢家。
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
    const resolver = createDefaultIdentityResolver(userStore, racingLinkStore)
    const resolved = await resolver.resolve(PROVIDER, SUB, { nickname: '输家' })

    // 返回赢家，而非新建的孤儿
    expect(resolved.id).toBe(winner.id)
    // 输家刚建的孤儿 user 已被清理：users 表只剩赢家
    expect(await countUsers()).toBe(1)
  })
})

describe('createDefaultIdentityResolver — JIT 关闭', () => {
  it('无 link → 抛 IdentityNotLinkedError（拒绝未知身份）', async () => {
    const resolver = createDefaultIdentityResolver(userStore, linkStore, { jit: false })
    await expect(resolver.resolve(PROVIDER, SUB, { nickname: '张三' })).rejects.toBeInstanceOf(
      IdentityNotLinkedError,
    )
    expect(await countUsers()).toBe(0) // 未建户
  })

  it('已有 link → 正常返回 user（不抛）', async () => {
    // 先预置关联
    const user = await userStore.create({ nickname: '预注册' })
    await linkStore.create({ userId: user.id, provider: PROVIDER, providerSub: SUB, rawProfile: null })
    const resolver = createDefaultIdentityResolver(userStore, linkStore, { jit: false })
    const resolved = await resolver.resolve(PROVIDER, SUB, { nickname: '预注册' })
    expect(resolved.id).toBe(user.id)
  })
})
