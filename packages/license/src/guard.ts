/**
 * 停服守卫（Hono middleware）：
 * - suspended → 503 JSON（bypass 默认放行健康检查路径与 /auth/*）
 * - grace → 放行 + X-Homura-License-Warning 头
 * - 网络失联默认 fail-open（宽限期内继续服务）；strict:true 则未注册/宽限期满即停
 *   （守卫不该让模板应用因授权服务器故障而宕机——DECISIONS 记录）
 *
 * 健康检查路径与 app-kit 注册的路径**同源**（core healthzPathFor）：qw-pages 上 '/healthz'
 * 被 Page Gateway 保留（实测网关自答 `ok`，请求不下发到 App 进程），App 实际注册在 '/_healthz'。
 * 若此处仍硬编码 '/healthz'，停服时健康检查会一起被 503，正好毁掉 ADR-011 想要的语义。
 */
import type { Context, MiddlewareHandler } from 'hono'
import { detectRuntime, healthzPathFor, type RuntimeTarget } from '@homurajs/core'
import type { LicenseClient } from './client.js'

export interface DefaultBypassOptions {
  /** 显式健康检查路径（推荐传 createApp 返回的 healthzPath，保证与注册路径完全一致） */
  healthzPath?: string
  /** 显式形态；缺省按 env 探测 */
  target?: RuntimeTarget
}

/** 默认豁免清单工厂：健康检查 + /auth/*（登录链在停服时仍须可用，否则无法重新激活） */
export function createDefaultBypass(opts: DefaultBypassOptions = {}): (c: Context) => boolean {
  const healthzPath =
    opts.healthzPath ?? healthzPathFor(opts.target ?? detectRuntime(process.env).target)
  return (c: Context): boolean => {
    const path = c.req.path
    return path === healthzPath || path.startsWith('/auth/')
  }
}

export interface LicenseGuardOptions extends DefaultBypassOptions {
  /** 完全自定义豁免判定（给了就不再走默认清单） */
  bypass?: (c: Context) => boolean
  strict?: boolean
}

export function licenseGuard(client: LicenseClient, opts?: LicenseGuardOptions): MiddlewareHandler {
  const bypass = opts?.bypass ?? createDefaultBypass(opts)
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
