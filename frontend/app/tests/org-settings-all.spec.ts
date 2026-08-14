import { test, expect } from '@playwright/test'
import { bootstrapAuthedSession } from './helpers/webauthn'

// OAuth-only 平台：密码登录已移除。用 WebAuthn 虚拟认证器以 provider
// 身份登录，遍历所有组织，验证服务商能访问每个组织详情页而不被 403。
// 注意：系统无种子数据，仅验证 OOBE 创建的服务商组织（org_id=1）。
test('服务商访问所有组织设置页面（WebAuthn 全真登录）', async ({ page }) => {
  page.on('console', msg => console.log(`[Browser] ${msg.text()}`))
  page.on('response', response => {
    if (response.status() === 403) {
      console.log(`[Test] 403错误: ${response.url()} - ${response.statusText()}`)
    }
  })

  const auth = await bootstrapAuthedSession(page)

  // OOBE 创建的服务商组织（org_id=1）
  const orgIds = [1]
  for (const orgId of orgIds) {
    await page.goto(`/provider/orgs/${orgId}`)
    await page.waitForTimeout(2000)

    const detailUrl = page.url()
    console.log(`[Test] 组织 ${orgId} 详情页URL: ${detailUrl}`)
    expect(detailUrl).toContain(`/provider/orgs/${orgId}`)

    const hasForbiddenText = await page.getByText('403').isVisible().catch(() => false) ||
                             await page.getByText('禁止访问').isVisible().catch(() => false) ||
                             await page.getByText('forbidden').isVisible().catch(() => false)
    expect(hasForbiddenText).toBe(false)

    console.log(`[Test] ✅ 组织 ${orgId} 详情页访问正常`)
  }

  await auth.remove()
  console.log('[Test] ✅ 所有组织详情页面访问正常喵！')
})
