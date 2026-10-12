/**
 * 停服守卫（Hono middleware）：
 * - suspended → 503 JSON（bypass 默认放行 /healthz 与 /auth/*）
 * - grace → 放行 + X-Homura-License-Warning 头
 * - 网络失联默认 fail-open（宽限期内继续服务）；strict:true 则 grace 期满即停
 *   （守卫不该让模板应用因授权服务器故障而宕机——DECISIONS 记录）
 */
import type { Context, MiddlewareHandler } from 'hono'
import type { LicenseClient } from './client.js'

export function licenseGuard(
  _client: LicenseClient,
  _opts?: { bypass?: (c: Context) => boolean; strict?: boolean },
): MiddlewareHandler {
  return async (_c, next) => {
    throw new Error('NotImplemented: licenseGuard')
  }
}
