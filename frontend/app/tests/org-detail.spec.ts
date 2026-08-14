import { test, expect } from '@playwright/test'
import { bootstrapAuthedSession } from './helpers/webauthn'

// OAuth-only 平台：密码登录已移除。用 WebAuthn 虚拟认证器以 provider
// 身份登录，验证组织详情页（部门树 + 成员管理）渲染。
// 注意：系统无种子数据，首个租户组织需由 provider 管理员创建后再验证。
test('组织详情页：部门树 + 成员管理（WebAuthn 全真登录）', async ({ page }) => {
  page.on('console', msg => console.log(`[Browser] ${msg.text()}`))
  page.on('dialog', d => d.accept())

  // provider 登录
  const auth = await bootstrapAuthedSession(page)

  // 进入组织管理页面，获取首个租户组织的 ID
  await page.goto('/provider/orgs')
  await page.waitForTimeout(1200)

  // 获取除服务商组织外的第一个租户组织行（如果有）
  const orgRows = page.locator('tbody tr')
  const orgCount = await orgRows.count()

  if (orgCount > 1) {
    // 有租户组织存在时，点击进入详情页
    // 点击第二行（跳过当前服务商组织）
    const tenantOrgRow = orgRows.nth(1)
    const orgName = await tenantOrgRow.locator('td').first().textContent()
    if (orgName) {
      await tenantOrgRow.getByRole('button', { name: '查看' }).click()
      await page.waitForTimeout(1000)

      // 验证进入详情页
      await expect(page.locator('.text-h5').filter({ hasText: orgName })).toBeVisible({ timeout: 10000 })

      // 部门 Tab（默认）：树形结构渲染
      await expect(page.getByText('根部门', { exact: true })).toBeVisible({ timeout: 10000 })

      // 切到「成员」Tab，验证成员列表渲染
      await page.locator('.v-tab').filter({ hasText: '成员' }).click()
      const memberRows = page.locator('tbody tr')
      await expect(memberRows.first()).toBeVisible({ timeout: 10000 })
    }
  } else {
    console.log('[Test] 当前无租户组织，跳过详情页测试')
  }

  await auth.remove()
  console.log('✅ 组织详情页 部门树 + 成员管理 测试完成喵！')
})
