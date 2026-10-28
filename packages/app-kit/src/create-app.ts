/**
 * createApp：渐进式组装入口。零注入也能跑（纯 routes），
 * 每注入一个模块解锁一层能力（auth/3p/license/db/storage 实例由 App 构造后传入）。
 * app-kit 不硬依赖这些能力包——类型采用结构化契约（鸭子类型），见 AppDeps。
 */
import { Hono } from 'hono'
import type { MiddlewareHandler } from 'hono'
import { randomUUID } from 'node:crypto'
import { HEALTHZ_PATH, type Logger } from '@homurajs/core'
import { createSpaFallback, createStaticMiddleware } from './static.js'

/** 能力实例的结构化契约（鸭子类型，避免包依赖；运行时由 App 传入） */
export interface AppDeps {
  db?: Record<string, unknown>
  storage?: StorageLike
  sessions?: SessionManagerLike
  platform?: PlatformLike
  license?: LicenseClientLike
}

/** 各能力的最小结构化契约（App 传真实例，app-kit 只透传/调用这些方法） */
export interface StorageLike {
  uploadFile(...args: never[]): Promise<unknown>
}
export interface SessionManagerLike {
  verifyAccessToken(t: string): Promise<unknown>
}
export interface PlatformLike {
  name: string
  capabilities: readonly string[]
}
export interface LicenseClientLike {
  getStatus(): string
}

/** auth 注入包（由 @homurajs/auth/hono 构造后传入） */
export interface AuthInject {
  sessions: SessionManagerLike
  sessionMiddleware: MiddlewareHandler
  authRoutes: Hono
}

/** license 注入包（由 @homurajs/license/hono 构造后传入） */
export interface LicenseInject {
  client: LicenseClientLike
  guard: MiddlewareHandler
}

export interface HealthCheck {
  name: string
  check: () => Promise<boolean> | boolean
}

export interface CreateAppOptions {
  /** 反向代理子路径挂载时，全中间件感知（默认 '/'） */
  basePath?: string
  routes?: Hono | ((deps: AppDeps) => Hono)
  /** 注入即启用认证链（sessionMiddleware + authRoutes） */
  auth?: AuthInject | false
  /** 3p 注入（deps.platform 暴露给 routes，App 内 supports() 协商用能力） */
  thirdParty?: { platform: PlatformLike }
  /** 注入即挂停服守卫 */
  license?: LicenseInject | false
  /** 注入 db/storage 汇总进 deps（供 routes 回调用） */
  db?: Record<string, unknown>
  storage?: StorageLike
  /**
   * 健康检查：路径缺省 core HEALTHZ_PATH（'/healthz'）。
   * 显式传 path 时，license guard 的豁免清单必须用同一个值（见 license createDefaultBypass）。
   */
  healthz?: { path?: string; checks?: HealthCheck[] }
  /** 静态资源目录（adapter.assetsDir() 算出）；提供则挂 static + SPA fallback */
  staticDir?: string
  logger?: Logger
  onError?: (err: Error, c: { path: string }) => Response | Promise<Response>
}

export interface HomuraApp {
  app: Hono
  /** 实际注册的健康检查路径（供 license guard 豁免清单等同源消费） */
  healthzPath: string
}

/**
 * 固定中间件链（模板文档逐环解释）：
 * basePath → requestId+访问日志 → healthz（注册于 guard 前，天然豁免）→ licenseGuard
 * → sessionMiddleware → authRoutes → App routes → 静态资源 → SPA fallback → onError
 */
export function createApp(options: CreateAppOptions = {}): HomuraApp {
  const basePath = options.basePath && options.basePath !== '/' ? options.basePath : undefined
  const app = basePath ? new Hono().basePath(basePath) : new Hono()

  const deps: AppDeps = {}
  if (options.db) deps.db = options.db
  if (options.storage) deps.storage = options.storage
  if (options.auth) deps.sessions = options.auth.sessions
  if (options.thirdParty) deps.platform = options.thirdParty.platform
  if (options.license) deps.license = options.license.client

  // ① requestId + 访问日志
  app.use('*', async (c, next) => {
    const reqId = c.req.header('x-request-id') ?? randomUUID()
    c.set('requestId', reqId)
    c.header('X-Request-Id', reqId)
    const start = Date.now()
    await next()
    options.logger?.info('request', {
      requestId: reqId,
      method: c.req.method,
      path: new URL(c.req.url).pathname,
      status: c.res.status,
      durationMs: Date.now() - start,
    })
  })

  // ② healthz（注册于 licenseGuard 之前 → 天然豁免守卫）
  const healthzPath = options.healthz?.path ?? HEALTHZ_PATH
  const checks = options.healthz?.checks ?? []
  app.get(healthzPath, async (c) => {
    if (checks.length === 0) return c.json({ status: 'ok' })
    const results: Record<string, 'ok' | 'fail'> = {}
    let allOk = true
    for (const { name, check } of checks) {
      try {
        const ok = await check()
        results[name] = ok ? 'ok' : 'fail'
        if (!ok) allOk = false
      } catch {
        results[name] = 'fail'
        allOk = false
      }
    }
    return c.json(
      { status: allOk ? 'ok' : 'degraded', checks: results },
      allOk ? 200 : 503,
    )
  })

  // ③ licenseGuard（注入即启用）
  if (options.license) app.use('*', options.license.guard)

  // ④ sessionMiddleware（注入即启用）
  if (options.auth) app.use('*', options.auth.sessionMiddleware)

  // ⑤ authRoutes
  if (options.auth) app.route('/', options.auth.authRoutes)

  // ⑥ App 业务路由
  if (options.routes) {
    const businessRoutes =
      typeof options.routes === 'function' ? options.routes(deps) : options.routes
    app.route('/', businessRoutes)
  }

  // ⑦ 静态资源 + SPA fallback（staticDir 提供时）
  if (options.staticDir) {
    app.use('*', createStaticMiddleware(options.staticDir))
    app.notFound(createSpaFallback(options.staticDir))
  } else {
    app.notFound((c) => c.json({ error: 'not_found', path: new URL(c.req.url).pathname }, 404))
  }

  // ⑧ onError
  app.onError((err, c) => {
    options.logger?.error('unhandled', {
      err: err.message,
      path: c.req.path,
      requestId: c.get('requestId'),
    })
    if (options.onError) return Promise.resolve(options.onError(err, { path: c.req.path }))
    return c.json({ error: 'internal_error', message: err.message }, 500)
  })

  return { app, healthzPath }
}

declare module 'hono' {
  interface ContextVariableMap {
    requestId: string
  }
}
