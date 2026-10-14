import { describe, expect, it, vi } from 'vitest'
import { Hono } from 'hono'
import type { LicenseGuardClient } from '@homurajs/license/hono'
import { buildLicenseDemoRoutes } from './license-demo.js'
import type { TodoRepo } from '../todos-repo.js'
import type { Todo } from '../../shared/types.js'

/**
 * 桩 client：只实现 LicenseGuardClient 的最小形状。
 * hasFeature 是安全关键——requireFeature 优先用它，且实现方必须只在验签通过时返回 true。
 * 这里用 verified 标志模拟"验签通过才认 features"的语义。
 */
function stubClient(opts: {
  status?: string
  features?: string[]
  verified?: boolean
  enforcement?: string
  notice?: string | null
}): LicenseGuardClient {
  const features = opts.features ?? []
  const verified = opts.verified ?? true
  return {
    getStatus: () => opts.status ?? 'active',
    getEnforcement: () => (opts.enforcement ?? 'none') as never,
    getNotice: () => opts.notice ?? null,
    getEntitlement: () =>
      verified
        ? ({ features, status: opts.status ?? 'active' } as never)
        : ({ features, status: opts.status ?? 'active' } as never),
    // 安全关键：只在 verified 时认 features（模拟真实 LicenseClient.hasFeature 的行为）
    hasFeature: (f: string) => verified && features.includes(f),
  }
}

/** 桩 repo：list 返回固定 todos */
function stubRepo(todos: Partial<Todo>[] = []): TodoRepo {
  const rows: Todo[] = todos.map((t, i) => ({
    id: t.id ?? `t-${i}`,
    title: t.title ?? `待办 ${i}`,
    done: t.done ?? false,
    ownerSub: t.ownerSub ?? null,
    createdAt: t.createdAt ?? Date.parse('2026-10-14T00:00:00.000Z'),
  }))
  return {
    list: vi.fn(async () => rows),
    create: vi.fn(async () => rows[0]!),
    toggle: vi.fn(async () => rows[0] ?? null),
    remove: vi.fn(async () => true),
  } as unknown as TodoRepo
}

function mount(client: LicenseGuardClient, repo: TodoRepo): Hono {
  const app = new Hono()
  app.route('/api/license-demo', buildLicenseDemoRoutes(client, repo))
  return app
}

describe('buildLicenseDemoRoutes — requireFeature 示范', () => {
  it('/status 不挂闸门：任何状态都可读', async () => {
    const app = mount(stubClient({ status: 'suspended', features: [] }), stubRepo())
    const res = await app.request('/api/license-demo/status')
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toMatchObject({
      status: 'suspended',
      features: [],
    })
  })

  it('/export 有 export 授权 → 200 + CSV', async () => {
    const repo = stubRepo([{ title: '买牛奶' }, { title: '写周报, 带逗号' }])
    const app = mount(stubClient({ features: ['export'] }), repo)
    const res = await app.request('/api/license-demo/export')
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('text/csv')
    expect(res.headers.get('content-disposition')).toContain('todos.csv')
    const body = await res.text()
    expect(body.split('\n')[0]).toBe('id,title,done,createdAt')
    expect(body).toContain('买牛奶')
    // 含逗号的字段被双引号包裹
    expect(body).toContain('"写周报, 带逗号"')
    expect(repo.list).toHaveBeenCalledOnce()
  })

  it('/export 无 export 授权 → 403 feature_not_licensed', async () => {
    const app = mount(stubClient({ features: ['beta'] }), stubRepo())
    const res = await app.request('/api/license-demo/export')
    expect(res.status).toBe(403)
    await expect(res.json()).resolves.toMatchObject({
      error: 'feature_not_licensed',
      feature: 'export',
    })
  })

  it('/export 验签失败 → 403（即使 features 里有 export，hasFeature 也返回 false）', async () => {
    // 安全关键：篡改者把 features 塞满也没用——hasFeature 只在 verified 时为 true
    const app = mount(stubClient({ features: ['export'], verified: false }), stubRepo())
    const res = await app.request('/api/license-demo/export')
    expect(res.status).toBe(403)
    await expect(res.json()).resolves.toMatchObject({ error: 'feature_not_licensed' })
  })

  it('/beta/ping 有 beta 授权 → 200', async () => {
    const app = mount(stubClient({ features: ['beta'] }), stubRepo())
    const res = await app.request('/api/license-demo/beta/ping')
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toMatchObject({ ok: true, feature: 'beta' })
  })

  it('/beta/ping 无 beta 授权 → 403', async () => {
    const app = mount(stubClient({ features: ['export'] }), stubRepo())
    const res = await app.request('/api/license-demo/beta/ping')
    expect(res.status).toBe(403)
  })

  it('未注册（features 为空）→ 所有闸门路由 403，/status 仍可读', async () => {
    const client = stubClient({ status: 'unknown', features: [] })
    const app = mount(client, stubRepo())
    expect((await app.request('/api/license-demo/status')).status).toBe(200)
    expect((await app.request('/api/license-demo/export')).status).toBe(403)
    expect((await app.request('/api/license-demo/beta/ping')).status).toBe(403)
  })
})
