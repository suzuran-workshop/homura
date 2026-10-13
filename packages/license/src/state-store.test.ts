import { describe, expect, it } from 'vitest'
import { Hono } from 'hono'
import { createSqliteDb } from '@homurajs/db'
import { createDrizzleStateStore } from './state-store.js'

describe('createDrizzleStateStore（sqlite）', () => {
  it('save → load 往返；instanceKey 稳定', async () => {
    const store = createDrizzleStateStore(createSqliteDb({ dialect: 'sqlite', path: ':memory:' }))
    await store.save({ instanceKey: 'ik-1', licenseId: 'lic-9' })
    await expect(store.load()).resolves.toEqual({ instanceKey: 'ik-1', licenseId: 'lic-9' })
    // 覆盖保存
    await store.save({ instanceKey: 'ik-1', licenseId: 'lic-10' })
    await expect(store.load()).resolves.toMatchObject({ licenseId: 'lic-10' })
  })

  it('空库 load → null', async () => {
    const store = createDrizzleStateStore(createSqliteDb({ dialect: 'sqlite', path: ':memory:' }))
    await expect(store.load()).resolves.toBeNull()
  })
})

describe('licenseGuard 集成（guard + fake client）', () => {
  it('占位：guard 行为在 guard.test.ts 覆盖', () => {
    const app = new Hono()
    app.get('/', (c) => c.text('ok'))
    expect(app).toBeDefined()
  })
})
