/**
 * WebAuthProvider 单测 —— 聚焦 #4 修复：匿名认证的 challengeKey 往返。
 *
 * @simplewebauthn/server 被 vi.mock 拦截（动态 import 同样命中），不跑真实 WebAuthn 密码学，
 * 只验证 challenge 存取键的契约：
 *  - 匿名（无 userId）：challengeKey = `anon:${random}`，verify 必须回传该 key 才能命中；
 *  - 已知 userId：challengeKey = `${userId}:auth`，verify 可省略 key（向后兼容）。
 *
 * 此前 bug：匿名 options 把 challenge 存在 `anon:xxx`，但 verify 只按 `${cred.userId}:auth` 取，
 * 且 API 不接受 key 回传 → discoverable credential 登录永远失败。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { sql } from 'drizzle-orm'
import { createSqliteDb } from '@homurajs/db'
import { createMemoryTtlKv, type TtlKv } from '@homurajs/core'
import { createDrizzleUserStore } from '../identity/user-store.js'
import { createDrizzleWebauthnCredentialStore } from './credential-drizzle-store.js'
import { WebAuthProvider } from './provider.js'
import type { AuthenticationResponse } from './provider.js'

// 拦截 @simplewebauthn/server：只返回测试需要的最小形状，不跑真实 ceremony 校验
vi.mock('@simplewebauthn/server', () => ({
  generateAuthenticationOptions: vi.fn(async () => ({
    challenge: 'challenge-abc',
    timeout: 60000,
    rpId: 'app.example.com',
    allowCredentials: [],
    userVerification: 'preferred',
  })),
  verifyAuthenticationResponse: vi.fn(async () => ({
    verified: true,
    authenticationInfo: { newCounter: 7 },
  })),
  generateRegistrationOptions: vi.fn(async () => ({ challenge: 'reg-challenge' })),
  verifyRegistrationResponse: vi.fn(async () => ({ verified: true, registrationInfo: null })),
}))

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
    `CREATE TABLE webauthn_credentials (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL, public_key TEXT NOT NULL,
      counter INTEGER NOT NULL, device_type TEXT NOT NULL, backed_up INTEGER NOT NULL,
      transports TEXT, display_name TEXT, created_at INTEGER NOT NULL
    )`,
  ))
  await db.run(sql.raw(`CREATE INDEX webauthn_creds_user_idx ON webauthn_credentials (user_id)`))
  return db
}

const CRED_ID = 'cred-id-1'
const PUB_KEY = 'cHViLWtleQ' // 任意 base64url 串（mock 不做真实校验）

let db: Awaited<ReturnType<typeof makeDb>>
let challengeKv: TtlKv
let provider: WebAuthProvider
let userId: string

beforeEach(async () => {
  db = await makeDb()
  const userStore = createDrizzleUserStore(db)
  const credentialStore = createDrizzleWebauthnCredentialStore(db)
  challengeKv = createMemoryTtlKv()
  provider = new WebAuthProvider({
    rpId: 'app.example.com',
    rpName: 'Test App',
    origin: 'https://app.example.com',
    credentialStore,
    userStore,
    challengeKv,
  })
  // 预置一个用户 + 一条凭证
  const user = await userStore.create({ username: 'passkey-user', nickname: 'PK' })
  userId = user.id
  await credentialStore.create({
    id: CRED_ID,
    userId,
    publicKey: PUB_KEY,
    counter: 0,
    deviceType: 'single',
    backedUp: 0,
    transports: null,
    displayName: '我的钥匙',
  })
})

function fakeAssertion(credId = CRED_ID): AuthenticationResponse {
  return {
    id: credId,
    rawId: credId,
    response: { clientDataJSON: 'cd', authenticatorData: 'ad', signature: 'sig', userHandle: null },
    type: 'public-key',
  }
}

describe('WebAuthProvider — 认证 challengeKey 契约（#4）', () => {
  it('匿名 options：challengeKey 以 anon: 开头，challenge 存在该 key 下', async () => {
    const { options, challengeKey } = await provider.generateAuthenticationOptions()
    expect(challengeKey).toMatch(/^anon:/)
    expect(options.challenge).toBe('challenge-abc')
    // challenge 确实存在 challengeKey 下（take 命中）
    expect(await challengeKv.take(challengeKey)).toBe('challenge-abc')
  })

  it('匿名流程：verify 回传 challengeKey → 成功返回用户并更新 counter', async () => {
    const { challengeKey } = await provider.generateAuthenticationOptions()
    const user = await provider.verifyAuthentication(fakeAssertion(), challengeKey)
    expect(user.id).toBe(userId)
    // counter 被更新为 mock 返回的 newCounter
    const cred = await provider.listCredentials(userId)
    expect(cred[0]?.counter).toBe(7)
  })

  it('匿名流程：verify 不回传 challengeKey → 抛 challenge 无效（证明 key 必需）', async () => {
    await provider.generateAuthenticationOptions() // 匿名，challenge 存在 anon:xxx
    // 不回传 key：verify 会去取 `${userId}:auth`（空）→ 失败
    await expect(provider.verifyAuthentication(fakeAssertion())).rejects.toThrow(/challenge 无效或已过期/)
  })

  it('已知 userId：challengeKey = `${userId}:auth`，verify 可省略 key（向后兼容）', async () => {
    const { challengeKey } = await provider.generateAuthenticationOptions(userId)
    expect(challengeKey).toBe(`${userId}:auth`)
    // 省略 challengeKey：verify 缺省按 `${cred.userId}:auth` 取 → 命中
    const user = await provider.verifyAuthentication(fakeAssertion())
    expect(user.id).toBe(userId)
  })

  it('challenge 一次性消费：同一 key 二次 verify 失败', async () => {
    const { challengeKey } = await provider.generateAuthenticationOptions(userId)
    await provider.verifyAuthentication(fakeAssertion(), challengeKey)
    // challenge 已被 take 消费，再用同 key → 失败
    await expect(provider.verifyAuthentication(fakeAssertion(), challengeKey)).rejects.toThrow(
      /challenge 无效或已过期/,
    )
  })

  it('凭证不存在 → 抛错（先于 challenge 校验）', async () => {
    const { challengeKey } = await provider.generateAuthenticationOptions()
    await expect(provider.verifyAuthentication(fakeAssertion('unknown-cred'), challengeKey)).rejects.toThrow(
      /凭证不存在/,
    )
  })
})
