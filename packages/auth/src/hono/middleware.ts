import type { MiddlewareHandler } from 'hono'
import type { SessionClaims } from '../session/manager.js'
import type { SessionManager } from '../session/manager.js'

/**
 * cookie 优先、Authorization: Bearer 兼容；
 * access 过期且 refresh cookie 有效 → 透明 rotate 续期；c.set('auth', claims)
 */
export function sessionMiddleware(
  sessions: SessionManager,
  opts?: { bearer?: boolean },
): MiddlewareHandler {
  throw new Error('NotImplemented: sessionMiddleware')
}

/** 无身份：/api 或 Accept:json → 401 JSON；页面请求 → 302 login */
export const requireAuth: MiddlewareHandler = async (_c, next) => {
  throw new Error('NotImplemented: requireAuth')
}

declare module 'hono' {
  interface ContextVariableMap {
    auth: SessionClaims
  }
}
