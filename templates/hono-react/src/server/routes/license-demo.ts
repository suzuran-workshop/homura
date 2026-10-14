/**
 * /api/license-demo 路由：中央激活的功能范围闸门活文档。
 *
 * 示范 `requireFeature(client, feature)` 的接法——逐路由声明"这条端点需要哪项授权功能"，
 * 许可证的 `features` 里没有这项就 403 `feature_not_licensed`。**默认拒绝**：拿不到授权载荷
 * （验签失败 / 未注册 / 中心失联超宽限期）一律不放行。
 *
 * 与 `licenseGuard` 的分工：
 * - guard（app.ts 全局挂载）管到期/停服的**全局处置**（enforcement=core/all 时拦路径）
 * - requireFeature（本文件逐路由挂载）管**逐点能力开关**（同一份产物散给多人，按 features 分权）
 *
 * 两者叠加：guard 先判"该不该全站/核心拦"，放行后再由 requireFeature 判"这条端点签给你了没"。
 *
 * ⚠ 安全关键：判定必须走 `client.hasFeature()`（只在验签通过时为 true），不能直接读
 * `getEntitlement().features`——后者在响应被篡改时仍会返回篡改后的清单，等于让攻击者
 * 自己给自己加功能。`requireFeature` 内部已经做对了，派生 App 照抄即可。
 */
import { Hono } from 'hono'
import { requireFeature, type LicenseGuardClient } from '@homurajs/license/hono'
import type { TodoRepo } from '../todos-repo.js'

export function buildLicenseDemoRoutes(client: LicenseGuardClient, repo: TodoRepo): Hono {
  const app = new Hono()

  /**
   * 当前授权状态（不挂闸门）——前端据此渲染功能开关。
   * 与全局 `/_license` 端点的区别：那个在 guard 豁免清单里（enforcement=all 时仍可读，
   * 且额外暴露 signature 验签状态供诊断），这个在 /api 下，enforcement=core/all 时会被
   * guard 先拦掉。派生 App 若要在停服时仍展示状态，请读 `/_license`。
   */
  app.get('/status', (c) =>
    c.json({
      status: client.getStatus(),
      enforcement: client.getEnforcement?.() ?? null,
      notice: client.getNotice?.() ?? null,
      features: client.getEntitlement?.()?.features ?? [],
    }),
  )

  /**
   * 导出功能：需要 `export` 授权。
   * 把当前用户的 todos 导成 CSV——示范"功能范围闸门 + 业务逻辑"的组合。
   */
  app.get('/export', requireFeature(client, 'export'), async (c) => {
    const ownerSub = c.get('auth')?.sub ?? null
    const todos = await repo.list(ownerSub)
    const csv = [
      'id,title,done,createdAt',
      ...todos.map((t) =>
        [t.id, csvEscape(t.title), t.done, t.createdAt].join(','),
      ),
    ].join('\n')
    c.header('Content-Type', 'text/csv; charset=utf-8')
    c.header('Content-Disposition', 'attachment; filename="todos.csv"')
    return c.body(csv)
  })

  /**
   * Beta 功能：需要 `beta` 授权。
   * 示范"同一份产物、不同持有者开不同能力"——中心给谁签了 beta，谁就能访问。
   */
  app.get('/beta/ping', requireFeature(client, 'beta'), (c) =>
    c.json({ ok: true, feature: 'beta', message: '你被授权访问 beta 功能' }),
  )

  return app
}

/** CSV 转义：含逗号/引号/换行的字段用双引号包裹，内部引号翻倍 */
function csvEscape(s: string): string {
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}
