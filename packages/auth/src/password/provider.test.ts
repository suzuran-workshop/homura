/**
 * PasswordProvider 单测 —— 走真实 drizzle 双方言 store（in-memory sqlite）。
 *
 * 覆盖：register / verify（成功/错密码/用户不存在/无密码记录）/ changePassword /
 * deletePassword / username 重复 / 注册失败清理孤儿 user（#8）/ 不存在用户不抛（#5 假哈希路径）。
 *
 * ⚠ 时序均衡（#5）是安全属性，无法用单测稳定断言（会 flaky），这里只锁「不存在用户也返回 null
 *   且不抛」这条行为不变量；假哈希分支被走到即证明耗时路径与存在用户一致。
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { sql } from 'drizzle-orm'
import { createSqliteDb } from '@homurajs/db'
import { createDrizzleUserStore } from '../identity/user-store.js'
import { createDrizzlePasswordStore } from './drizzle-store.js'
import { PasswordProvider, UsernameTakenError } from './provider.js'
import type { PasswordStore } from './store.js'
import type { UserStore } from '../identity/types.js'

/** 与 drizzle 迁移产物一致的 DDL（username 唯一性走唯一索引，非 inline UNIQUE） */
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
    `CREATE TABLE passwords (
      user_id TEXT PRIMARY KEY, password_hash TEXT NOT NULL,
      created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
    )`,
  ))
  return db
}

let db: Awaited<ReturnType<typeof makeDb>>
let userStore: UserStore
let passwordStore: PasswordStore
let provider: PasswordProvider

beforeEach(async () => {
  db = await makeDb()
  userStore = createDrizzleUserStore(db)
  passwordStore = createDrizzlePasswordStore(db)
  provider = new PasswordProvider({ userStore, passwordStore })
})

describe('PasswordProvider.register', () => {
  it('创建 user + password 记录，随后 verify 成功', async () => {
    const user = await provider.register({ username: 'alice', password: 'password123', nickname: 'Alice' })
    expect(user.id).toBeTruthy()
    expect(user.username).toBe('alice')
    expect(user.nickname).toBe('Alice')
    // 密码记录已落库
    const rec = await passwordStore.findByUserId(user.id)
    expect(rec).not.toBeNull()
    expect(rec!.passwordHash).toMatch(/^\$scrypt\$16384,8,1\$/)
    // verify 成功
    const verified = await provider.verify('alice', 'password123')
    expect(verified?.id).toBe(user.id)
  })

  it('username 重复 → 抛 UsernameTakenError（预检，路由层据此回 409）', async () => {
    await provider.register({ username: 'bob', password: 'password123' })
    await expect(provider.register({ username: 'bob', password: 'otherpass123' })).rejects.toBeInstanceOf(
      UsernameTakenError,
    )
  })

  it('注册时 password 记录创建失败 → 清理孤儿 user，不留占用的 username（#8）', async () => {
    // 包一个 create 必失败的 passwordStore
    const failingStore: PasswordStore = {
      ...passwordStore,
      create: async () => {
        throw new Error('模拟 password 写入失败')
      },
    }
    const p = new PasswordProvider({ userStore, passwordStore: failingStore })
    await expect(p.register({ username: 'carol', password: 'password123' })).rejects.toThrow(
      /模拟 password 写入失败/,
    )
    // 孤儿 user 已被清理：username 未被占用，可重新注册
    expect(await userStore.findByUsername('carol')).toBeNull()
    // 重新注册（用正常 store）应成功，证明 username 没被孤儿占着
    const retry = await provider.register({ username: 'carol', password: 'password123' })
    expect(retry.username).toBe('carol')
  })
})

describe('PasswordProvider.verify', () => {
  beforeEach(async () => {
    await provider.register({ username: 'dave', password: 'correct-horse' })
  })

  it('密码正确 → 返回 user', async () => {
    const u = await provider.verify('dave', 'correct-horse')
    expect(u?.username).toBe('dave')
  })

  it('密码错误 → null', async () => {
    expect(await provider.verify('dave', 'wrong-password')).toBeNull()
  })

  it('用户不存在 → null 且不抛（走假哈希分支，#5）', async () => {
    await expect(provider.verify('nobody', 'whatever123')).resolves.toBeNull()
  })

  it('用户存在但无密码记录 → null 且不抛', async () => {
    // 直接建一个无密码的 user（模拟 OAuth2-only 用户）
    await userStore.create({ username: 'oauth-only' })
    await expect(provider.verify('oauth-only', 'whatever123')).resolves.toBeNull()
  })
})

describe('PasswordProvider.changePassword', () => {
  beforeEach(async () => {
    await provider.register({ username: 'erin', password: 'old-password' })
  })

  it('旧密码正确 → 改密成功，旧密码失效、新密码生效', async () => {
    await provider.changePassword((await userStore.findByUsername('erin'))!.id, 'old-password', 'new-password')
    expect(await provider.verify('erin', 'old-password')).toBeNull()
    expect((await provider.verify('erin', 'new-password'))?.username).toBe('erin')
  })

  it('旧密码错误 → 抛错，密码不变', async () => {
    const id = (await userStore.findByUsername('erin'))!.id
    await expect(provider.changePassword(id, 'wrong-old', 'new-password')).rejects.toThrow(/旧密码错误/)
    expect((await provider.verify('erin', 'old-password'))?.username).toBe('erin')
  })

  it('无密码记录 → 抛错', async () => {
    const u = await userStore.create({ username: 'no-pw' })
    await expect(provider.changePassword(u.id, 'x', 'new-password')).rejects.toThrow(/密码记录不存在/)
  })
})

describe('PasswordProvider.deletePassword', () => {
  it('删除后密码登录不可用', async () => {
    const user = await provider.register({ username: 'frank', password: 'password123' })
    expect(await provider.verify('frank', 'password123')).not.toBeNull()
    await provider.deletePassword(user.id)
    expect(await provider.verify('frank', 'password123')).toBeNull()
    // user 本身还在（只删了密码凭证）
    expect(await userStore.findById(user.id)).not.toBeNull()
  })
})
