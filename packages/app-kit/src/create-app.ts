/**
 * createApp：渐进式组装入口。零注入也能跑（纯 routes），
 * 每注入一个模块解锁一层能力（auth/3p/license/db/storage 实例由 App 构造后传入）。
 * app-kit 不硬依赖这些能力包——类型采用结构化契约（鸭子类型），见 AppDeps。
 */
import type { Hono, MiddlewareHandler } from 'hono'
import type { RuntimeInfo, RuntimeTarget } from '@homura/core'

/** 能力实例的结构化契约（鸭子类型，避免包依赖；运行时由 App 传入） */
export interface AppDeps {
  db?: { $isHomuraDb?: boolean } & Record<string, unknown>
  storage?: { uploadFile(...args: unknown[]): Promise<unknown> } & Record<string, unknown>
  sessions?: { verifyAccessToken(t: string): Promise<unknown> } & Record<string, unknown>
  platform?: { name: string; capabilities: readonly string[] } & Record<string, unknown>
  license?: { getStatus(): string } & Record<string, unknown>
}

export interface CreateAppOptions {
  runtime?: RuntimeTarget | 'auto'
  /** qw-pages 子路径挂载时，全中间件感知 */
  basePath?: string
  routes?: Hono | ((deps: AppDeps) => Hono)
  /** 注入 sessions 即启用 sessionMiddleware + 挂 auth 路由（路由由 @homura/auth/hono 生成） */
  auth?:
    | {
        sessions: NonNullable<AppDeps['sessions']>
        sessionMiddleware: MiddlewareHandler
        authRoutes: Hono
      }
    | false
  /** 3p 注入（deps.platform 暴露给 routes，App 内 supports() 协商用能力） */
  thirdParty?: { platform: NonNullable<AppDeps['platform']> }
  license?:
    | {
        client: NonNullable<AppDeps['license']>
        guard: MiddlewareHandler
      }
    | false
  healthz?: {
    checks?: Array<{ name: string; check: () => Promise<boolean> | boolean }>
  }
  onError?: (err: Error, c: { path: string }) => Response | Promise<Response>
}

export interface HomuraApp {
  app: Hono
  runtime: RuntimeInfo
}

/**
 * 固定中间件链（模板文档逐环解释）：
 * basePath → request-id+访问日志 → /healthz（豁免守卫）→ licenseGuard
 * → sessionMiddleware → authRoutes → App routes → 静态资源(dist/client) → SPA fallback
 */
export function createApp(_options?: CreateAppOptions): HomuraApp {
  throw new Error('NotImplemented: createApp')
}
