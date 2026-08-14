import { test, expect } from '@playwright/test';

// OAuth-only platform: password login is gone. This test verifies the login
// page renders the WebAuthn (Passkey) and DingTalk entry points.
// Self-registration is disabled — users must be created by an admin via OOBE.
test('登录页渲染 OAuth 入口（WebAuthn + 钉钉）', async ({ page }) => {
  page.on('console', (msg) => console.log(`[Browser] ${msg.text()}`));

  await page.goto('http://localhost:5173/login');

  // 邮箱/用户名输入框
  await page.waitForSelector('input[placeholder="输入注册时的邮箱或用户名"]', { timeout: 5000 });

  // Passkey 登录按钮
  await expect(page.getByRole('button', { name: /Passkey 登录/ })).toBeVisible();

  // 钉钉登录按钮
  await expect(page.getByRole('button', { name: '钉钉登录' })).toBeVisible();

  // 注册入口已移除（自主注册不对普通用户开放）
  await expect(page.getByRole('link', { name: '注册 Passkey' })).not.toBeVisible();

  console.log('✅ 登录页 OAuth 入口渲染正常喵！');
});
