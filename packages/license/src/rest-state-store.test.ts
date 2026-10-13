import { describe, expect, it, vi } from 'vitest'
import type { RestDb } from '@homurajs/db'
import {
  LICENSE_STATE_ROW_ID,
  LICENSE_STATE_TABLE,
  createRestStateStore,
} from './rest-state-store.js'

interface Call {
  op: string
  args: unknown[]
}

function stubRest(results: { select?: unknown[][]; insert?: unknown[][] } = {}) {
  const calls: Call[] = []
  const queue: Record<string, unknown[][]> = { select: [], insert: [], ...results }
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

const NOW = 1_700_000_000_123

describe('createRestStateStore — 与 drizzle 版语义对齐', () => {
  it('load 命中：snake_case 列映射为 camelCase 字段', async () => {
    const { rest, calls } = stubRest({ select: [[{ license_id: 'lic-1', instance_key: 'ik-1' }]] })
    const s = await createRestStateStore(rest).load()
    expect(s).toEqual({ licenseId: 'lic-1', instanceKey: 'ik-1' })
    expect(calls[0]!.args[0]).toEqual({ id: LICENSE_STATE_ROW_ID })
    expect(calls[0]!.args[1]).toEqual({ columns: 'license_id,instance_key', limit: 1 })
  })

  it('load：license_id 为 null 时映射成 undefined（与 drizzle 版一致）', async () => {
    const { rest } = stubRest({ select: [[{ license_id: null, instance_key: 'ik' }]] })
    await expect(createRestStateStore(rest).load()).resolves.toEqual({
      licenseId: undefined,
      instanceKey: 'ik',
    })
  })

  it('load 未命中 → null', async () => {
    const { rest } = stubRest({ select: [[]] })
    await expect(createRestStateStore(rest).load()).resolves.toBeNull()
  })

  it('save：单行 upsert（on_conflict=id），updated_at 为秒级', async () => {
    const { rest, calls } = stubRest()
    await createRestStateStore(rest, { now: () => NOW }).save({
      licenseId: 'lic-1',
      instanceKey: 'ik-1',
    })
    expect(calls[0]!.op).toBe('insert')
    expect(calls[0]!.args[0]).toEqual({
      id: 'default',
      license_id: 'lic-1',
      instance_key: 'ik-1',
      updated_at: Math.floor(NOW / 1000),
    })
    expect(calls[0]!.args[1]).toEqual({ upsertOn: 'id' })
  })

  it('save：licenseId 缺省写 null', async () => {
    const { rest, calls } = stubRest()
    await createRestStateStore(rest, { now: () => NOW }).save({ instanceKey: 'ik' })
    expect((calls[0]!.args[0] as Record<string, unknown>)['license_id']).toBeNull()
  })

  it('默认表名 license_state，可覆盖', () => {
    expect(LICENSE_STATE_TABLE).toBe('license_state')
    const seen: string[] = []
    const rest = {
      table: (name: string) => {
        seen.push(name)
        return {} as never
      },
    } as unknown as RestDb
    createRestStateStore(rest)
    createRestStateStore(rest, { table: 'app_license' })
    expect(seen).toEqual(['license_state', 'app_license'])
  })
})
