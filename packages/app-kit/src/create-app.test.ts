import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Hono } from 'hono'
import type { MiddlewareHandler } from 'hono'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createApp } from './create-app.js'

/** 假 guard：状态由外部切换 */
function fakeGuard(getStatus: () => string): MiddlewareHandler {
  return async (c, next) => {
    if (getStatus() === 'suspended') return c.json({ error: 'service_suspended' }, 503)
    await next()
  }
}

describe('createApp — 基础与中间件链', () => {
  it('零注入：纯 routes 也能跑', async () => {
    const routes = new Hono()
    routes.get('/hello', (c) => c.text('hi'))
    const { app } = createApp({ routes })
    const res = await app.request('/hello')
    expect(res.status).toBe(200)
    expect(await res.text()).toBe('hi')
  })

  it('requestId 中间件：生成并回写 X-Request-Id 头', async () => {
    const { app } = createApp({ routes: new Hono().get('/', (c) => c.text('ok')) })
    const res = await app.request('/')
    expect(res.headers.get('x-request-id')).toMatch(/[0-9a-f-]{36}/)
  })

  it('传入 x-request-id 则复用', async () => {
    const { app } = createApp({ routes: new Hono().get('/', (c) => c.text('ok')) })
    const res = await app.request('/', { headers: { 'x-request-id': 'trace-abc' } })
    expect(res.headers.get('x-request-id')).toBe('trace-abc')
  })

  it('basePath：全路由挂到子路径', async () => {
    const routes = new Hono().get('/x', (c) => c.text('x'))
    const { app } = createApp({ basePath: '/myapp', routes })
    expect((await app.request('/myapp/x')).status).toBe(200)
    expect((await app.request('/x')).status).toBe(404)
  })

  it('routes 回调收到汇总 deps（db/storage/sessions/platform/license）', async () => {
    const seen: unknown[] = []
    const routes = (deps: Record<string, unknown>) => {
      seen.push(deps)
      return new Hono().get('/', (c) => c.text('ok'))
    }
    createApp({
      db: { tag: 'db' },
      storage: { uploadFile: async () => ({}) },
      thirdParty: { platform: { name: 'dingtalk', capabilities: ['message'] } },
      routes: routes as never,
    })
    const deps = seen[0] as Record<string, unknown>
    expect(deps.db).toMatchObject({ tag: 'db' })
    expect(deps.storage).toBeDefined()
    expect(deps.platform).toMatchObject({ name: 'dingtalk' })
  })

  it('onError：抛错走自定义处理', async () => {
    const routes = new Hono().get('/boom', () => {
      throw new Error('kaboom')
    })
    const { app } = createApp({
      routes,
      onError: (err) => new Response(JSON.stringify({ handled: err.message }), { status: 500 }),
    })
    const res = await app.request('/boom')
    expect(res.status).toBe(500)
    await expect(res.json()).resolves.toMatchObject({ handled: 'kaboom' })
  })

  it('默认 onError → 500 JSON', async () => {
    const routes = new Hono().get('/boom', () => {
      throw new Error('x')
    })
    const { app } = createApp({ routes })
    const res = await app.request('/boom')
    expect(res.status).toBe(500)
    await expect(res.json()).resolves.toMatchObject({ error: 'internal_error' })
  })
})

describe('createApp — healthz 与 licenseGuard 顺序', () => {
  it('healthz 无 checks → ok', async () => {
    const { app } = createApp()
    const res = await app.request('/healthz')
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toMatchObject({ status: 'ok' })
  })

  it('healthz checks：全 ok → 200；有 fail → 503 degraded', async () => {
    const ok = createApp({ healthz: { checks: [{ name: 'a', check: () => true }] } })
    expect((await ok.app.request('/healthz')).status).toBe(200)

    const bad = createApp({
      healthz: {
        checks: [
          { name: 'a', check: () => true },
          { name: 'b', check: () => false },
        ],
      },
    })
    const res = await bad.app.request('/healthz')
    expect(res.status).toBe(503)
    await expect(res.json()).resolves.toMatchObject({
      status: 'degraded',
      checks: { a: 'ok', b: 'fail' },
    })
  })

  it('healthz check 抛错 → fail（不炸健康检查）', async () => {
    const { app } = createApp({
      healthz: {
        checks: [
          {
            name: 'x',
            check: () => {
              throw new Error('down')
            },
          },
        ],
      },
    })
    const res = await app.request('/healthz')
    expect(res.status).toBe(503)
    await expect(res.json()).resolves.toMatchObject({ checks: { x: 'fail' } })
  })

  it('licenseGuard suspended → 业务 503，但 /healthz 豁免（注册于 guard 前）', async () => {
    let status = 'active'
    const routes = new Hono().get('/api/x', (c) => c.text('data'))
    const { app } = createApp({
      routes,
      license: { client: { getStatus: () => status }, guard: fakeGuard(() => status) },
    })
    expect((await app.request('/api/x')).status).toBe(200)
    status = 'suspended'
    expect((await app.request('/api/x')).status).toBe(503)
    // healthz 始终可达（探活用）
    expect((await app.request('/healthz')).status).toBe(200)
  })
})

describe('createApp — 认证链装配', () => {
  it('auth 注入：sessionMiddleware 先于 routes，authRoutes 挂载', async () => {
    const order: string[] = []
    const sessionMiddleware: MiddlewareHandler = async (_c, next) => {
      order.push('session')
      await next()
    }
    const authRoutes = new Hono().get('/auth/login', (c) => {
      order.push('authRoute')
      return c.text('login')
    })
    const routes = new Hono().get('/api/x', (c) => {
      order.push('route')
      return c.text('x')
    })
    const { app } = createApp({
      routes,
      auth: { sessions: { verifyAccessToken: async () => null }, sessionMiddleware, authRoutes },
    })
    await app.request('/auth/login')
    expect(order).toEqual(['session', 'authRoute'])
    order.length = 0
    await app.request('/api/x')
    expect(order).toEqual(['session', 'route'])
  })
})

describe('createApp — 静态资源 + SPA fallback', () => {
  let dir: string
  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'homura-static-'))
    mkdirSync(join(dir, 'assets'), { recursive: true })
    writeFileSync(join(dir, 'index.html'), '<html><body>SPA</body></html>')
    writeFileSync(join(dir, 'assets', 'app.abc123.js'), 'console.log(1)')
  })
  afterAll(() => rmSync(dir, { recursive: true, force: true }))

  it('命中静态文件 → 正确 content-type + 长缓存', async () => {
    const { app } = createApp({ staticDir: dir })
    const res = await app.request('/assets/app.abc123.js')
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('javascript')
    expect(res.headers.get('cache-control')).toContain('immutable')
    expect(await res.text()).toBe('console.log(1)')
  })

  it('未命中路径（页面）→ SPA fallback index.html', async () => {
    const { app } = createApp({ staticDir: dir })
    const res = await app.request('/some/spa/route')
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('text/html')
    expect(await res.text()).toContain('SPA')
  })

  it('根路径 → index.html', async () => {
    const { app } = createApp({ staticDir: dir })
    const res = await app.request('/')
    expect(res.status).toBe(200)
    expect(await res.text()).toContain('SPA')
  })

  it('API 路径未命中 → 404 JSON（不回落 index.html）', async () => {
    const { app } = createApp({ staticDir: dir })
    const res = await app.request('/api/nope')
    expect(res.status).toBe(404)
    await expect(res.json()).resolves.toMatchObject({ error: 'not_found' })
  })

  it('路径穿越防护：../ 不逃逸 staticDir', async () => {
    const { app } = createApp({ staticDir: dir })
    const res = await app.request('/../../etc/passwd')
    // 绝不返回系统文件内容；命中 SPA fallback 或 404 均可接受
    const body = await res.text()
    expect(body).not.toContain('root:')
    expect(res.headers.get('content-type') ?? '').not.toContain('text/plain')
  })

  it('业务路由优先于静态（同名路径 routes 赢）', async () => {
    const routes = new Hono().get('/index.html', (c) => c.text('from-route'))
    const { app } = createApp({ routes, staticDir: dir })
    const res = await app.request('/index.html')
    expect(await res.text()).toBe('from-route')
  })
})

describe('createApp — 预压缩侧车文件（br / gzip）', () => {
  let dir: string
  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'homura-compress-'))
    mkdirSync(join(dir, 'assets'), { recursive: true })
    // 原始文件 + br 侧车 + gz 侧车
    writeFileSync(join(dir, 'assets', 'app.abc.js'), 'original-js-body')
    writeFileSync(join(dir, 'assets', 'app.abc.js.br'), 'br-compressed-body')
    writeFileSync(join(dir, 'assets', 'app.abc.js.gz'), 'gz-compressed-body')
    // 只有 gz 没有 br 的文件
    writeFileSync(join(dir, 'assets', 'style.xyz.css'), 'original-css-body')
    writeFileSync(join(dir, 'assets', 'style.xyz.css.gz'), 'gz-css-body')
    // 没有任何侧车的文件
    writeFileSync(join(dir, 'assets', 'plain.txt'), 'plain-text-body')
  })
  afterAll(() => rmSync(dir, { recursive: true, force: true }))

  it('Accept-Encoding: br → 优先返回 .br 侧车', async () => {
    const { app } = createApp({ staticDir: dir })
    const res = await app.request('/assets/app.abc.js', {
      headers: { 'accept-encoding': 'br, gzip' },
    })
    expect(res.status).toBe(200)
    expect(res.headers.get('content-encoding')).toBe('br')
    expect(res.headers.get('content-type')).toContain('javascript')
    expect(res.headers.get('vary')).toBe('Accept-Encoding')
    expect(await res.text()).toBe('br-compressed-body')
  })

  it('Accept-Encoding: gzip → 返回 .gz 侧车', async () => {
    const { app } = createApp({ staticDir: dir })
    const res = await app.request('/assets/app.abc.js', {
      headers: { 'accept-encoding': 'gzip' },
    })
    expect(res.status).toBe(200)
    expect(res.headers.get('content-encoding')).toBe('gzip')
    expect(res.headers.get('content-type')).toContain('javascript')
    expect(await res.text()).toBe('gz-compressed-body')
  })

  it('Accept-Encoding 同时含 br+gzip → br 优先于 gzip', async () => {
    const { app } = createApp({ staticDir: dir })
    const res = await app.request('/assets/app.abc.js', {
      headers: { 'accept-encoding': 'gzip, br' },
    })
    expect(res.headers.get('content-encoding')).toBe('br')
    expect(await res.text()).toBe('br-compressed-body')
  })

  it('无 Accept-Encoding → 返回原始文件', async () => {
    const { app } = createApp({ staticDir: dir })
    const res = await app.request('/assets/app.abc.js')
    expect(res.status).toBe(200)
    expect(res.headers.get('content-encoding')).toBeNull()
    expect(res.headers.get('content-type')).toContain('javascript')
    expect(await res.text()).toBe('original-js-body')
  })

  it('Accept-Encoding: br 但只有 .gz 侧车 → 回落 .gz', async () => {
    const { app } = createApp({ staticDir: dir })
    const res = await app.request('/assets/style.xyz.css', {
      headers: { 'accept-encoding': 'br, gzip' },
    })
    expect(res.status).toBe(200)
    expect(res.headers.get('content-encoding')).toBe('gzip')
    expect(res.headers.get('content-type')).toContain('text/css')
    expect(await res.text()).toBe('gz-css-body')
  })

  it('Accept-Encoding 不匹配任何侧车 → 返回原始文件', async () => {
    const { app } = createApp({ staticDir: dir })
    const res = await app.request('/assets/style.xyz.css', {
      headers: { 'accept-encoding': 'br' },
    })
    expect(res.status).toBe(200)
    expect(res.headers.get('content-encoding')).toBeNull()
    expect(await res.text()).toBe('original-css-body')
  })

  it('无侧车文件 → 始终返回原始文件', async () => {
    const { app } = createApp({ staticDir: dir })
    const res = await app.request('/assets/plain.txt', {
      headers: { 'accept-encoding': 'br, gzip' },
    })
    expect(res.status).toBe(200)
    expect(res.headers.get('content-encoding')).toBeNull()
    expect(res.headers.get('content-type')).toContain('text/plain')
    expect(await res.text()).toBe('plain-text-body')
  })

  it('压缩侧车仍保留 cache-control（immutable 长缓存）', async () => {
    const { app } = createApp({ staticDir: dir })
    const res = await app.request('/assets/app.abc.js', {
      headers: { 'accept-encoding': 'br' },
    })
    expect(res.headers.get('cache-control')).toContain('immutable')
  })

  it('HEAD 请求 + 压缩侧车 → 无 body 但有正确头', async () => {
    const { app } = createApp({ staticDir: dir })
    const res = await app.request('/assets/app.abc.js', {
      method: 'HEAD',
      headers: { 'accept-encoding': 'gzip' },
    })
    expect(res.status).toBe(200)
    expect(res.headers.get('content-encoding')).toBe('gzip')
    expect(res.headers.get('content-type')).toContain('javascript')
    expect(await res.text()).toBe('')
  })
})

describe('runtime 探测透传', () => {
  it('显式 runtime=qw-pages → runtime.target', () => {
    const { runtime } = createApp({ runtime: 'qw-pages' })
    expect(runtime.target).toBe('qw-pages')
    expect(runtime.explicit).toBe(true)
  })

  it('auto → detectRuntime(process.env)', () => {
    const { runtime } = createApp({ runtime: 'auto' })
    expect(['standalone', 'qw-pages']).toContain(runtime.target)
  })
})

describe('qw-pages 形态（2026-10-13 线上实测校准）', () => {
  it('不再导出 exportHandlers：平台从不调用导出函数（探针 handler 命中 0 次）', async () => {
    const mod = await import('./runtime/qw-pages.js')
    expect('exportHandlers' in mod).toBe(false)
  })

  it('start() 真的监听端口（与 standalone 共用实现），不再抛「不监听端口」', async () => {
    const { QW_PAGES_DEFAULT_PORT, createQwPagesAdapter } = await import('./runtime/qw-pages.js')
    const adapter = createQwPagesAdapter()
    expect(QW_PAGES_DEFAULT_PORT).toBe(8081)
    expect(adapter.trustProxy()).toBe(true)
    const { app } = createApp({ routes: new Hono().get('/ping', (c) => c.text('pong')) })
    const ac = new AbortController()
    await expect(adapter.start(app, { port: 0, signal: ac.signal })).resolves.toBeUndefined()
    ac.abort()
  })

  it('assetsDir 默认 client（发布根即产物根），不再落到 node_modules 内', async () => {
    const { createQwPagesAdapter } = await import('./runtime/qw-pages.js')
    const adapter = createQwPagesAdapter()
    expect(adapter.assetsDir({})).toBe(join(process.cwd(), 'client'))
    expect(adapter.assetsDir({})).not.toContain('node_modules')
    expect(adapter.assetsDir({ HOMURA_ASSETS_DIR: '/tmp/xyz' })).toBe('/tmp/xyz')
  })
})

describe('healthz 路径按形态取（qw-pages 让开被网关保留的 /healthz）', () => {
  it('standalone → /healthz', async () => {
    const { app, healthzPath } = createApp({ runtime: 'standalone' })
    expect(healthzPath).toBe('/healthz')
    expect((await app.request('/healthz')).status).toBe(200)
  })

  it('qw-pages → /_healthz，且 App 不再注册 /healthz', async () => {
    const { app, healthzPath } = createApp({ runtime: 'qw-pages' })
    expect(healthzPath).toBe('/_healthz')
    const res = await app.request('/_healthz')
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toMatchObject({ status: 'ok', runtime: 'qw-pages' })
    expect((await app.request('/healthz')).status).toBe(404)
  })

  it('显式 healthz.path 覆盖形态缺省', async () => {
    const { app, healthzPath } = createApp({ runtime: 'qw-pages', healthz: { path: '/ready' } })
    expect(healthzPath).toBe('/ready')
    expect((await app.request('/ready')).status).toBe(200)
  })

  it('healthzPath 与 license guard 豁免清单同源（core healthzPathFor）', async () => {
    const { healthzPathFor } = await import('@homurajs/core')
    expect(createApp({ runtime: 'qw-pages' }).healthzPath).toBe(healthzPathFor('qw-pages'))
    expect(createApp({ runtime: 'standalone' }).healthzPath).toBe(healthzPathFor('standalone'))
  })

  it('畸形百分号编码路径不再 500（decodeURIComponent 抛错被吞 → 交 fallback）', async () => {
    const badDir = mkdtempSync(join(tmpdir(), 'homura-bad-'))
    writeFileSync(join(badDir, 'index.html'), '<html></html>')
    const { app } = createApp({ staticDir: badDir })
    expect((await app.request('/bad%zz')).status).not.toBe(500)
    rmSync(badDir, { recursive: true, force: true })
  })
})

describe('node adapter', () => {
  it('trustProxy 由 TRUST_PROXY 控制；assetsDir 默认 dist/client', async () => {
    const { createNodeAdapter } = await import('./runtime/node.js')
    const adapter = createNodeAdapter()
    expect(adapter.target).toBe('standalone')
    const orig = process.env.TRUST_PROXY
    delete process.env.TRUST_PROXY
    expect(adapter.trustProxy()).toBe(false)
    process.env.TRUST_PROXY = '1'
    expect(adapter.trustProxy()).toBe(true)
    if (orig === undefined) delete process.env.TRUST_PROXY
    else process.env.TRUST_PROXY = orig
    expect(adapter.assetsDir({})).toMatch(/dist\/client$/)
  })
})
