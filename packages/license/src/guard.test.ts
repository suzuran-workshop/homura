import { describe, expect, it } from 'vitest'
import { Hono } from 'hono'
import type { LicenseStatus } from './contract.js'
import { licenseGuard } from './guard.js'
import type { LicenseClient } from './client.js'

function fakeClient(status: LicenseStatus): LicenseClient {
  return { getStatus: () => status } as unknown as LicenseClient
}

function guardedApp(status: LicenseStatus, opts?: { strict?: boolean }) {
  const app = new Hono()
  app.use('*', licenseGuard(fakeClient(status), opts))
  app.get('/healthz', (c) => c.text('healthy'))
  app.get('/auth/login', (c) => c.text('login'))
  app.get('/api/data', (c) => c.text('data'))
  app.get('/', (c) => c.text('home'))
  return app
}

describe('licenseGuard', () => {
  it('active → 全放行', async () => {
    const app = guardedApp('active')
    expect((await app.request('/api/data')).status).toBe(200)
  })

  it('suspended → 503，/healthz 与 /auth/* 豁免', async () => {
    const app = guardedApp('suspended')
    const data = await app.request('/api/data')
    expect(data.status).toBe(503)
    await expect(data.json()).resolves.toMatchObject({ error: 'service_suspended' })
    expect((await app.request('/healthz')).status).toBe(200)
    expect((await app.request('/auth/login')).status).toBe(200)
  })

  it('grace → 放行 + X-Homura-License-Warning 头', async () => {
    const app = guardedApp('grace')
    const res = await app.request('/api/data')
    expect(res.status).toBe(200)
    expect(res.headers.get('X-Homura-License-Warning')).toBe('grace')
  })

  it('unknown：默认 fail-open 放行；strict 模式 503（healthz 仍豁免）', async () => {
    expect((await guardedApp('unknown').request('/api/data')).status).toBe(200)
    const strict = guardedApp('unknown', { strict: true })
    expect((await strict.request('/api/data')).status).toBe(503)
    expect((await strict.request('/healthz')).status).toBe(200)
  })
})
