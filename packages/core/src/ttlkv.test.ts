import { describe, expect, it } from 'vitest'
import { createMemoryTtlKv, randomToken } from './ttlkv.js'

describe('createMemoryTtlKv', () => {
  it('set → take 取出值', async () => {
    const kv = createMemoryTtlKv()
    await kv.set('k', 'v', 60_000)
    expect(await kv.take('k')).toBe('v')
  })

  it('take 一次性消费：第二次 null', async () => {
    const kv = createMemoryTtlKv()
    await kv.set('k', 'v', 60_000)
    await kv.take('k')
    expect(await kv.take('k')).toBeNull()
  })

  it('过期后 take 返回 null', async () => {
    const kv = createMemoryTtlKv()
    await kv.set('k', 'v', -1) // 已过期
    expect(await kv.take('k')).toBeNull()
  })

  it('不存在的 key → null', async () => {
    const kv = createMemoryTtlKv()
    expect(await kv.take('nope')).toBeNull()
  })

  it('maxEntries 触发淘汰（清扫后仍满则逐出最旧）', async () => {
    const kv = createMemoryTtlKv({ maxEntries: 2 })
    await kv.set('a', '1', 60_000)
    await kv.set('b', '2', 60_000)
    await kv.set('c', '3', 60_000)
    // a 被逐出（插入序最旧）
    expect(await kv.take('a')).toBeNull()
    expect(await kv.take('b')).toBe('2')
    expect(await kv.take('c')).toBe('3')
  })
})

describe('randomToken', () => {
  it('base64url 且长度对应', () => {
    const t = randomToken(16)
    expect(t).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(Buffer.from(t, 'base64url').length).toBe(16)
  })
})
