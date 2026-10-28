/**
 * DirectoryStore 单测 —— identity_directory 表 CRUD（sqlite 内存库）。
 *
 * 覆盖：upsert 新建/更新、findByProviderAndSub、listByProvider、remove。
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { sql } from 'drizzle-orm'
import { createSqliteDb } from '@homurajs/db'
import { createDrizzleDirectoryStore } from './directory-store.js'
import type { DirectoryStore } from './types.js'

async function makeDb() {
  const db = createSqliteDb({ dialect: 'sqlite', path: ':memory:' })
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

let store: DirectoryStore

const PROVIDER = 'dingtalk'

beforeEach(async () => {
  const db = await makeDb()
  store = createDrizzleDirectoryStore(db)
})

describe('createDrizzleDirectoryStore', () => {
  it('upsert 新建：返回完整条目，可查回', async () => {
    const entry = await store.upsert({ provider: PROVIDER, sub: 's1', name: '张三', raw: '{"dept":["数学组"]}' })
    expect(entry.id).toBeTruthy()
    expect(entry.provider).toBe(PROVIDER)
    expect(entry.sub).toBe('s1')
    expect(entry.name).toBe('张三')
    expect(entry.raw).toBe('{"dept":["数学组"]}')
    expect(entry.createdAt).toBe(entry.updatedAt)
    const found = await store.findByProviderAndSub(PROVIDER, 's1')
    expect(found?.id).toBe(entry.id)
    expect(found?.name).toBe('张三')
  })

  it('upsert 已存在：更新 name/raw，id/createdAt 不变，updatedAt 前移', async () => {
    let clock = 1000
    const db = await makeDb()
    const ticking = createDrizzleDirectoryStore(db, { now: () => clock })
    const created = await ticking.upsert({ provider: PROVIDER, sub: 's1', name: '旧名' })
    clock = 2000
    const updated = await ticking.upsert({ provider: PROVIDER, sub: 's1', name: '新名', raw: '{"x":1}' })
    expect(updated.id).toBe(created.id)
    expect(updated.createdAt).toBe(1000)
    expect(updated.updatedAt).toBe(2000)
    expect(updated.name).toBe('新名')
    expect(updated.raw).toBe('{"x":1}')
    const found = await ticking.findByProviderAndSub(PROVIDER, 's1')
    expect(found?.name).toBe('新名')
  })

  it('upsert 不传 name/raw：落 null', async () => {
    const entry = await store.upsert({ provider: PROVIDER, sub: 's2' })
    expect(entry.name).toBeNull()
    expect(entry.raw).toBeNull()
  })

  it('listByProvider：只返回该 provider 的条目，按创建时间排序', async () => {
    await store.upsert({ provider: PROVIDER, sub: 'a', name: 'A' })
    await store.upsert({ provider: 'other', sub: 'x', name: 'X' })
    await store.upsert({ provider: PROVIDER, sub: 'b', name: 'B' })
    const list = await store.listByProvider(PROVIDER)
    expect(list.map((e) => e.sub)).toEqual(['a', 'b'])
  })

  it('remove：删除后查不到', async () => {
    await store.upsert({ provider: PROVIDER, sub: 's1', name: '张三' })
    await store.remove(PROVIDER, 's1')
    expect(await store.findByProviderAndSub(PROVIDER, 's1')).toBeNull()
  })

  it('快照对账：upsert 全量重放后 list 与上游一致', async () => {
    for (const sub of ['u1', 'u2', 'u3']) {
      await store.upsert({ provider: PROVIDER, sub, name: `老师-${sub}` })
    }
    await store.remove(PROVIDER, 'u2') // 上游已离职
    const list = await store.listByProvider(PROVIDER)
    expect(list.map((e) => e.sub)).toEqual(['u1', 'u3'])
  })
})
