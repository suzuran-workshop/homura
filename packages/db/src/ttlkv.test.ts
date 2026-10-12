import { describe, expect, it } from 'vitest'
import { createDbTtlKv } from './ttlkv.js'
import { createSqliteDb } from './sqlite.js'

describe('createDbTtlKv（sqlite :memory:）', () => {
  it('set → take 取出并一次性消费', async () => {
    const kv = createDbTtlKv(createSqliteDb({ dialect: 'sqlite', path: ':memory:' }))
    await kv.set('state-1', 'return-to=/dash', 300_000)
    expect(await kv.take('state-1')).toBe('return-to=/dash')
    expect(await kv.take('state-1')).toBeNull()
  })

  it('过期后 take 返回 null', async () => {
    const kv = createDbTtlKv(createSqliteDb({ dialect: 'sqlite', path: ':memory:' }))
    await kv.set('k', 'v', -5_000)
    expect(await kv.take('k')).toBeNull()
  })

  it('同 key 覆盖（upsert）', async () => {
    const kv = createDbTtlKv(createSqliteDb({ dialect: 'sqlite', path: ':memory:' }))
    await kv.set('k', 'v1', 300_000)
    await kv.set('k', 'v2', 300_000)
    expect(await kv.take('k')).toBe('v2')
  })

  it('并发多次 set/take 无串扰', async () => {
    const kv = createDbTtlKv(createSqliteDb({ dialect: 'sqlite', path: ':memory:' }))
    await Promise.all(
      Array.from({ length: 20 }, (_, i) => kv.set(`k${i}`, `v${i}`, 300_000)),
    )
    const taken = await Promise.all(
      Array.from({ length: 20 }, (_, i) => kv.take(`k${i}`)),
    )
    expect(taken.filter((v) => v !== null)).toHaveLength(20)
  })
})
