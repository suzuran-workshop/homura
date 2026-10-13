import { describe, expect, it, vi } from 'vitest'
import type { RestDb } from '@homurajs/db'
import { REFRESH_TOKENS_TABLE, createRestSessionStore } from './rest-store.js'
import type { RefreshTokenRecord } from './record.js'

interface Call {
  op: string
  args: unknown[]
}

/** 桩 RestDb：每个算子按队列返回结果，记录全部调用（house style：不 mock 全局 fetch） */
function stubRest(
  results: { select?: unknown[][]; update?: unknown[][]; insert?: unknown[][] } = {},
) {
  const calls: Call[] = []
  const queue: Record<string, unknown[][]> = { select: [], update: [], insert: [], ...results }
  const make = (op: string) =>
    vi.fn(async (...args: unknown[]) => {
      calls.push({ op, args })
      return (queue[op]?.shift() ?? []) as never
    })
  const table = {
    select: make('select'),
    insert: make('insert'),
    update: make('update'),
    remove: make('remove'),
  }
  const rest = { table: () => table, ping: vi.fn(async () => {}) } as unknown as RestDb
  return { rest, calls }
}

const REC: RefreshTokenRecord = {
  tokenHash: 'hash-1',
  familyId: 'fam-1',
  sid: 'sid-1',
  sub: 'user-1',
  expiresAt: 2_000_000_000_000,
  profile: '{"nickname":"n"}',
}

const NOW = 1_700_000_000_000

describe('createRestSessionStore — 与 drizzle 版语义对齐', () => {
  it('create：列名是 tables.ts 的 snake_case，且不写 used_at（保持 NULL）', async () => {
    const { rest, calls } = stubRest()
    await createRestSessionStore(rest, { now: () => NOW }).create(REC)
    expect(calls[0]!.op).toBe('insert')
    expect(calls[0]!.args[0]).toEqual({
      token_hash: 'hash-1',
      family_id: 'fam-1',
      sid: 'sid-1',
      sub: 'user-1',
      expires_at: 2_000_000_000_000,
      profile: '{"nickname":"n"}',
    })
    expect(calls[0]!.args[0] as Record<string, unknown>).not.toHaveProperty('used_at')
  })

  it('create：profile 缺省写 null', async () => {
    const { rest, calls } = stubRest()
    await createRestSessionStore(rest).create({ ...REC, profile: undefined })
    expect((calls[0]!.args[0] as Record<string, unknown>)['profile']).toBeNull()
  })

  it('consume 抢占成功：一条 PATCH 搞定，过滤含 used_at is.null 与 expires_at gt', async () => {
    const { rest, calls } = stubRest({
      update: [
        [
          {
            token_hash: 'hash-1',
            family_id: 'fam-1',
            sid: 'sid-1',
            sub: 'user-1',
            profile: 'p',
            used_at: NOW,
          },
        ],
      ],
    })
    const r = await createRestSessionStore(rest, { now: () => NOW }).consume('hash-1')
    expect(r).toEqual({
      familyId: 'fam-1',
      sid: 'sid-1',
      sub: 'user-1',
      profile: 'p',
      revoked: false,
    })
    // 关键：抢占成功时不发第二条 SELECT（与 SQL 版一致）
    expect(calls).toHaveLength(1)
    expect(calls[0]!.op).toBe('update')
    expect(calls[0]!.args[0]).toEqual({ used_at: NOW })
    expect(calls[0]!.args[1]).toEqual({
      token_hash: 'hash-1',
      expires_at: { op: 'gt', value: NOW },
      used_at: null,
    })
  })

  it('consume 抢占失败 + 行已消费 → revoked:true（复用检出，familyId 来自第二次查询）', async () => {
    const { rest, calls } = stubRest({
      update: [[]],
      select: [[{ family_id: 'fam-9', used_at: NOW - 1 }]],
    })
    const r = await createRestSessionStore(rest, { now: () => NOW }).consume('hash-1')
    expect(r).toEqual({ familyId: 'fam-9', sid: '', sub: '', profile: null, revoked: true })
    expect(calls.map((c) => c.op)).toEqual(['update', 'select'])
    expect(calls[1]!.args[1]).toEqual({ columns: 'family_id,used_at', limit: 1 })
  })

  it('consume 抢占失败 + 行不存在 → null', async () => {
    const { rest } = stubRest({ update: [[]], select: [[]] })
    await expect(
      createRestSessionStore(rest, { now: () => NOW }).consume('gone'),
    ).resolves.toBeNull()
  })

  it('consume 抢占失败 + 行存在但未消费（已过期）→ null，不误报复用', async () => {
    const { rest } = stubRest({ update: [[]], select: [[{ family_id: 'fam-1', used_at: null }]] })
    await expect(
      createRestSessionStore(rest, { now: () => NOW }).consume('hash-1'),
    ).resolves.toBeNull()
  })

  it('used_at 为字符串（bigint 经 PostgREST 可能返回字符串）也判为已消费', async () => {
    const { rest } = stubRest({
      update: [[]],
      select: [[{ family_id: 'fam-1', used_at: '1700000000000' }]],
    })
    const r = await createRestSessionStore(rest, { now: () => NOW }).consume('hash-1')
    expect(r?.revoked).toBe(true)
  })

  it('revokeFamily / revokeUser：只吊销未消费的行', async () => {
    const { rest, calls } = stubRest()
    const store = createRestSessionStore(rest, { now: () => NOW })
    await store.revokeFamily('fam-1')
    await store.revokeUser('user-1')
    expect(calls[0]).toMatchObject({
      op: 'update',
      args: [{ used_at: NOW }, { family_id: 'fam-1', used_at: null }],
    })
    expect(calls[1]).toMatchObject({
      op: 'update',
      args: [{ used_at: NOW }, { sub: 'user-1', used_at: null }],
    })
  })

  it('默认表名 refresh_tokens，可覆盖', async () => {
    expect(REFRESH_TOKENS_TABLE).toBe('refresh_tokens')
    const seen: string[] = []
    const rest = {
      table: (name: string) => {
        seen.push(name)
        return {} as never
      },
    } as unknown as RestDb
    createRestSessionStore(rest)
    createRestSessionStore(rest, { table: 'app_refresh' })
    expect(seen).toEqual(['refresh_tokens', 'app_refresh'])
  })
})
