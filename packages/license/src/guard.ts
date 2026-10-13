/**
 * 停服 / 到期守卫（Hono middleware）+ 功能范围闸门。
 *
 * 处置分两维，都由中心控制、可随时调整：
 * - **status** 说"发生了什么"：active / expired / suspended / grace / unknown
 * - **enforcement** 说"该拦多少"：none（只记录）/ notice（仅强提醒）/
 *   core（禁 App 声明的核心路径）/ all（全站 503）
 *
 * 只要 status 不是 active，**每个响应都带强提醒**（`X-Homura-License-Notice`，URI 编码传输，
 * 前端 `decodeURI` 还原）——"每次使用强提醒、无差别提示所有用户"是硬要求，故提醒不依赖
 * enforcement 档位（`none` 档除外，那档的语义就是不提醒）。
 *
 * 健康检查路径与 app-kit 注册的路径**同源**（core healthzPathFor）：qw-pages 上 '/healthz'
 * 被 Page Gateway 保留（实测网关自答 `ok`，请求不下发到 App 进程），App 实际注册在 '/_healthz'。
 * 若此处仍硬编码 '/healthz'，停服时健康检查会一起被 503，正好毁掉 ADR-011 想要的语义。
 *
 * fail-open（ADR-011）：grace 与 unknown 不拦，只加警告头；strict 下 unknown 才 503。
 */
import type { Context, MiddlewareHandler } from 'hono'
import { detectRuntime, healthzPathFor, type RuntimeTarget } from '@homurajs/core'
import type { Enforcement, LicenseEntitlement, LicenseStatus } from './contract.js'

/** 守卫需要的最小客户端形状（LicenseClient 天然满足；测试可只给 getStatus） */
export interface LicenseGuardClient {
  getStatus(): LicenseStatus | string
  getEnforcement?(): Enforcement
  getNotice?(): string | null
  getEntitlement?(): LicenseEntitlement | null
  /**
   * 是否被授予某功能——**实现方必须只在验签通过时才返回 true**。
   * requireFeature 优先用它；缺失时才退回读 getEntitlement().features（自定义 client 需自行保证可信）。
   */
  hasFeature?(feature: string): boolean
}

export interface DefaultBypassOptions {
  /** 显式健康检查路径（推荐传 createApp 返回的 healthzPath，保证与注册路径完全一致） */
  healthzPath?: string
  /** 显式形态；缺省按 env 探测 */
  target?: RuntimeTarget
}

/**
 * 授权状态端点的约定路径。它必须**始终可读**（因此进豁免清单）：
 * 否则 enforcement=all 时前端连"为什么全站 503"都问不到，强提醒也就无从展示。
 */
export const LICENSE_STATUS_PATH = '/_license'

/** 默认豁免清单工厂：健康检查 + /auth/*（停服时仍须能走登录链）+ /_license（前端要读提醒文案） */
export function createDefaultBypass(opts: DefaultBypassOptions = {}): (c: Context) => boolean {
  const healthzPath =
    opts.healthzPath ?? healthzPathFor(opts.target ?? detectRuntime(process.env).target)
  return (c: Context): boolean => {
    const path = c.req.path
    return path === healthzPath || path.startsWith('/auth/') || path === LICENSE_STATUS_PATH
  }
}

export interface LicenseGuardOptions extends DefaultBypassOptions {
  /** 完全自定义豁免判定（给了就不再走默认清单） */
  bypass?: (c: Context) => boolean
  /** unknown 状态是否也拦（默认 fail-open 放行） */
  strict?: boolean
  /** enforcement='core' 时算核心功能的路径前缀；缺省 ['/api']（页面与静态资源不拦，用户才看得到提醒） */
  corePaths?: string[]
  /** 覆盖中心下发的处置强度（本地演练 / 灰度用） */
  enforcement?: Enforcement
}

const DEFAULT_CORE_PATHS: readonly string[] = ['/api']

export function licenseGuard(
  client: LicenseGuardClient,
  opts?: LicenseGuardOptions,
): MiddlewareHandler {
  const bypass = opts?.bypass ?? createDefaultBypass(opts)
  const strict = opts?.strict ?? false
  const corePaths = opts?.corePaths ?? DEFAULT_CORE_PATHS

  return async (c, next) => {
    if (bypass(c)) {
      await next()
      return
    }
    const status = client.getStatus() as LicenseStatus

    if (status === 'active') {
      // active 时也可能有中心显式下发的运营通知（到期前预警等）：照常展示，但不影响任何功能
      const activeNotice = client.getNotice?.()
      if (activeNotice) {
        c.header('X-Homura-License-Status', 'active')
        c.header('X-Homura-License-Notice', encodeURI(activeNotice))
      }
      await next()
      return
    }
    if (status === 'grace') {
      // fail-open：失联宽限期内继续服务，但打上警告头
      c.header('X-Homura-License-Warning', 'grace')
      const graceNotice = client.getNotice?.()
      if (graceNotice) c.header('X-Homura-License-Notice', encodeURI(graceNotice))
      await next()
      return
    }
    if (status === 'unknown') {
      if (strict) return c.json({ error: 'license_not_activated' }, 503)
      await next()
      return
    }

    // expired / suspended：按处置强度决定拦多少
    const enforcement = opts?.enforcement ?? client.getEnforcement?.() ?? 'all'
    const notice = client.getNotice?.() ?? null
    c.header('X-Homura-License-Status', status)
    if (enforcement !== 'none' && notice) {
      // HTTP 头只能安全承载 latin1，中文文案必须编码；前端 decodeURI 还原
      c.header('X-Homura-License-Notice', encodeURI(notice))
    }

    const deny = () =>
      c.json(
        {
          error: status === 'expired' ? 'license_expired' : 'service_suspended',
          message: notice ?? (status === 'expired' ? '授权已到期' : '服务已被远程停用'),
          enforcement,
        },
        503,
      )

    if (enforcement === 'all') return deny()
    if (enforcement === 'core' && isCorePath(c.req.path, corePaths)) return deny()
    // notice 档、core 档的非核心路径、none 档：放行（提醒头已带上）
    await next()
  }
}

function isCorePath(path: string, corePaths: readonly string[]): boolean {
  return corePaths.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))
}

/**
 * 功能范围闸门：许可证的 features 里没有这项就 403。
 *
 * **默认拒绝**（拿不到授权载荷 = 不放行）——功能范围的意义就在于"没签给你就没有"。
 * ⚠ 判定必须走 `client.hasFeature()`（只在验签通过时为 true），不能直接读
 * `getEntitlement().features`：后者在响应被篡改时仍会返回篡改后的清单，
 * 等于让攻击者自己给自己加功能。这条曾是真的漏洞，由测试锁住。
 *
 * 与 licenseGuard 叠加使用：guard 管到期/停服的全局处置，本中间件管逐点能力开关。
 */
export function requireFeature(client: LicenseGuardClient, feature: string): MiddlewareHandler {
  return async (c, next) => {
    const granted =
      client.hasFeature?.(feature) ?? client.getEntitlement?.()?.features.includes(feature) ?? false
    if (!granted) {
      return c.json(
        {
          error: 'feature_not_licensed',
          feature,
          message: `本许可证未包含功能「${feature}」，请联系供应方升级授权`,
        },
        403,
      )
    }
    await next()
  }
}
