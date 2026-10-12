import type { Hono } from 'hono'
import type { OAuth2Client } from '../oauth2/client.js'
import type { SessionManager } from '../session/manager.js'

export interface AuthPaths {
  login?: string
  callback?: string
  refresh?: string
  logout?: string
}

/**
 * GET /auth/login    → 302 authorize（returnTo via query）
 * GET /auth/callback → 建 session 写双 cookie → 302 returnTo
 * POST /auth/refresh → rotate
 * POST /auth/logout  → 吊销 + 清 cookie
 */
export function createAuthRoutes(opts: {
  client: OAuth2Client
  sessions: SessionManager
  paths?: AuthPaths
}): Hono {
  throw new Error('NotImplemented: createAuthRoutes')
}
