import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Hono } from 'hono'
import { LicenseClient } from './client.js'
import type { RegisterRequest, HeartbeatRequest } from './contract.js'

/** fake homura-genuine：Hono 实例 + fetchImpl 直通 app.fetch */
function fakeGenuine(behavior: {
  registerStatus?: 'active' | 'grace' | 'suspended'
  heartbeatStatus?: 'active' | 'grace' | 'suspended'
  failHeartbeat?: boolean
}) {
  const seen = { register: [] as RegisterRequest[], heartbeat: [] as HeartbeatRequest[] }
  const app = new Hono()
  app.post('/v1/register', async (c) => {
    seen.register.push(await c.req.json<RegisterRequest>())
    return c.json({
      licenseId: 'lic-1',
      status: behavior.registerStatus ?? 'active',
      heartbeatIntervalSec: 60,
      graceSec: 300,
      issuedAt: new Date().toISOString(),
    })
  })
  app.post('/v1/heartbeat', async (c) => {
    seen.heartbeat.push(await c.req.json<HeartbeatRequest>())
    if (behavior.failHeartbeat) return c.json({ error: 'boom' }, 500)
    return c.json({
      status: behavior.heartbeatStatus ?? 'active',
      heartbeatIntervalSec: 60,
      serverTime: new Date().toISOString(),
    })
  })
  const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) =>
    app.fetch(new Request(url, init))) as unknown as typeof fetch
  return { app, seen, fetchImpl }
}

let nowMs = 1_700_000_000_000

beforeEach(() => {
  nowMs = 1_700_000_000_000
})
afterEach(() => vi.restoreAllMocks())

function makeClient(fetchImpl: typeof fetch, extra?: { now?: () => number }) {
  return new LicenseClient({
    server: 'https://genuine.example',
    productId: 'prod',
    appId: 'app',
    fetchImpl,
    now: extra?.now ?? (() => nowMs),
  })
}

describe('LicenseClient', () => {
  it('register 成功 → active + 状态持久化字段', async () => {
    const g = fakeGenuine({})
    const client = makeClient(g.fetchImpl)
    const resp = await client.register()
    expect(resp.licenseId).toBe('lic-1')
    expect(client.getStatus()).toBe('active')
    expect(g.seen.register[0]).toMatchObject({ productId: 'prod', appId: 'app' })
    expect(g.seen.register[0]!.instanceKey).toMatch(/^[A-Za-z0-9_-]{16,}$/)
  })

  it('心跳成功 → 宽限期重置（保持 active）', async () => {
    vi.useFakeTimers()
    try {
      const g = fakeGenuine({})
      const client = makeClient(g.fetchImpl)
      await client.register()
      client.startHeartbeat()
      // 推进 1 分钟（心跳在期间成功过，宽限重置）
      await vi.advanceTimersByTimeAsync(60_000)
      nowMs += 60_000
      expect(g.seen.heartbeat.length).toBeGreaterThan(0)
      expect(client.getStatus()).toBe('active')
    } finally {
      vi.useRealTimers()
    }
  })

  it('心跳全部失败 → 宽限期内 active、超宽限 grace', async () => {
    vi.useFakeTimers()
    try {
      const g = fakeGenuine({ failHeartbeat: true })
      const client = makeClient(g.fetchImpl)
      await client.register()
      // 推进 3 分钟（宽限 300s 内）
      await vi.advanceTimersByTimeAsync(180_000)
      nowMs += 180_000
      expect(client.getStatus()).toBe('active')
      // 推进到超宽限
      await vi.advanceTimersByTimeAsync(180_000)
      nowMs += 180_000
      expect(client.getStatus()).toBe('grace')
    } finally {
      vi.useRealTimers()
    }
  })

  it('server 明示 suspended → 立即 suspended（宽限期内也停）', async () => {
    vi.useFakeTimers()
    try {
      const g = fakeGenuine({ heartbeatStatus: 'suspended' })
      const client = makeClient(g.fetchImpl)
      await client.register()
      client.startHeartbeat()
      await vi.advanceTimersByTimeAsync(60_000)
      expect(client.getStatus()).toBe('suspended')
    } finally {
      vi.useRealTimers()
    }
  })

  it('未 register → unknown', () => {
    const g = fakeGenuine({})
    expect(makeClient(g.fetchImpl).getStatus()).toBe('unknown')
  })

  it('stop() 后不再心跳', async () => {
    vi.useFakeTimers()
    try {
      const g = fakeGenuine({})
      const client = makeClient(g.fetchImpl)
      await client.register()
      client.startHeartbeat()
      await vi.advanceTimersByTimeAsync(60_000)
      const count = g.seen.heartbeat.length
      client.stop()
      await vi.advanceTimersByTimeAsync(180_000)
      expect(g.seen.heartbeat.length).toBe(count)
    } finally {
      vi.useRealTimers()
    }
  })
})
