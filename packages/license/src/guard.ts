/**
 * 停服守卫（Hono middleware）：
 * - suspended → 503 JSON（bypass 默认放行 /healthz 与 /auth/*）
 * - grace → 放行 + X-Homura-License-Warning 头
 * - 网络失联默认 fail-open（宽限期内继续服务）；strict:true 则未注册/宽限期满即停
 *   （守卫不该让模板应用因授权服务器故障而宕机——DECISIONS 记录）
 */
import type { Context, MiddlewareHandler } from 'hono'
import type { LicenseClient } from './client.js'

const DEFAULT_BYPASS = (c: Context): boolean => {
  const path = c.req.path
  return path === '/healthz' || path.startsWith('/auth/')
}

export function licenseGuard(
  client: LicenseClient,
  opts?: { bypass?: (c: Context) => boolean; strict?: boolean },
): MiddlewareHandler {
  const bypass = opts?.bypass ?? DEFAULT_BYPASS
  const strict = opts?.strict ?? false
  return async (c, next) => {
    if (bypass(c)) {
      await next()
      return
    }
    const status = client.getStatus()
    if (status === 'suspended') {
      return c.json({ error: 'service_suspended', message: '服务已被远程停用' }, 503)
    }
    if (status === 'grace') {
      c.header('X-Homura-License-Warning', 'grace')
      await next()
      return
    }
    if (strict && status === 'unknown') {
      return c.json({ error: 'license_not_activated' }, 503)
    }
    await next()
  }
}
