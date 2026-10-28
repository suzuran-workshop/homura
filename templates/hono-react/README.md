# template-hono-react

homura 全栈模板：Hono + React + Vite，**AI 开发的起点与活文档**——每个能力包在这里都有使用示范。

> **派生 App 前先读 `AGENTS.md` 的「能力清单」。**

## 渐进式装配

装配核心是 `src/server/app.ts` 的 `buildApp(config, overrides)`：从 `src/server/env.ts`
的 `configSpecs`（defineConfig）读出「启用了哪些能力」，逐级注入 `createApp`。
每能力一组独立 env，缺省则不启用——从零能力到全家桶：

| 层级 | 开关 env                                     | 解锁                                                       | 装配文件            |
| ---- | -------------------------------------------- | ---------------------------------------------------------- | ------------------- |
| 0    | 无                                           | 纯 routes + 健康检查 + 静态 SPA                            | app.ts              |
| 1    | `DIALECT=sqlite\|pg`（缺省 sqlite）          | db + schema + 迁移                                         | db.ts / schema/     |
| 2    | `OAUTH_DINGTALK_ORG_ID`                      | 钉钉登录（oidc-dingtalk）+ session                         | app.ts buildAuth    |
| 3    | `DINGTALK_APP_KEY`+`_SECRET`                 | 平台消息/审批/通讯录（3p 能力协商）                        | routes/platform.ts  |
| 4    | `STORAGE_BACKEND=local\|s3\|supabase`        | 图床/文件                                                  | routes/files.ts     |
| 5    | `GENUINE_SERVER`（+ `GENUINE_PUBLIC_KEY`）   | 激活心跳 + Ed25519 验签 + 到期/停服四档处置 + 功能范围闸门 | app.ts buildLicense |

### 授权（层级 5）要点

配了 `GENUINE_SERVER` 即启用，但**还必须配 `GENUINE_PUBLIC_KEY`**（中心 Ed25519 公钥 PEM），
否则不验签——中心响应可被中间人改成 `active`（App 会 warn，且 features 一律拒绝）。
PEM 是多行，写进 `config/homura.config.env` 时用双引号包裹、换行写成 `\n`。

- `GENUINE_CORE_PATHS`（缺省 `/api`）：中心把处置强度设为 `core` 时，命中这些前缀的路径 503，
  其余放行但仍带提醒头（页面要能打开，用户才看得到提醒）
- `GET /_license` → `{status, enforcement, notice, expiresAt, features, signature}`。
  它在守卫豁免清单里，所以全站 503 时仍可读——**前端要靠它渲染强提醒**。
  模板已给示范组件 `src/client/LicenseBanner.tsx`：轮询 `/_license`，只要 `notice` 非空就
  展示且**不可关闭**（产品硬要求"每次使用强提醒、无差别提示所有用户"），未启用 license 时
  自身返回 null 不打扰。派生 App 照抄即可
- 每个非 active 响应都带 `X-Homura-License-Status` 与 `X-Homura-License-Notice`
  （后者是 `encodeURI` 过的中文，前端 `decodeURI` 还原）
- 功能范围用 `requireFeature(client, 'export')` 挂在具体路由上（**默认拒绝**）。
  模板已给示范路由 `src/server/routes/license-demo.ts`（见下方「中央激活用例」），
  派生 App 照抄接法即可
- `register()` 失败**不会**让 App 退出（fail-open 覆盖启动期）：状态停在 `unknown`，
  心跳循环继续重试。别在 `onStart` 里让它抛到顶层

### 中央激活用例（层级 5 活文档）

模板用 `src/server/routes/license-demo.ts` + `src/client/LicenseBanner.tsx` 示范"中央激活"
的完整接法——同一份产物散给多人，中心按 `features` 分权、按 `status`/`enforcement` 处置：

| 端点 | 闸门 | 示范什么 |
| ---- | ---- | -------- |
| `GET /api/license-demo/status` | 无 | 前端读当前授权状态渲染功能开关（与 `/_license` 的区别：这个在 `/api` 下，`enforcement=core/all` 时会被 guard 先拦） |
| `GET /api/license-demo/export` | `requireFeature(client, 'export')` | 功能范围闸门 + 业务逻辑组合：把 todos 导成 CSV，没签 `export` 就 403 `feature_not_licensed` |
| `GET /api/license-demo/beta/ping` | `requireFeature(client, 'beta')` | 多 feature 并存：中心给谁签了 `beta` 谁能访问 |

前端 `App.tsx` 的「中央激活」区块给三个按钮（导出 CSV / 调用 beta / 刷新状态），点击即打
对应端点，把 `requireFeature` 的 200/403 结果直接展示出来。`LicenseBanner` 挂在页面顶部，
中心 PATCH 出 `notice` 后下一次轮询（≤15s）即弹出强提醒。

**接法要点**（派生 App 照抄）：

1. 路由工厂收 `LicenseGuardClient`（`LicenseClient` 天然满足），逐路由挂
   `requireFeature(client, '<feature>')`——**默认拒绝**，拿不到授权载荷（验签失败/未注册/
   失联超宽限）一律 403
2. 安全关键：判定走 `client.hasFeature()`（只在验签通过时为 true），**不能**直接读
   `getEntitlement().features`——后者在响应被篡改时仍返回篡改后的清单，等于让攻击者
   自己给自己加功能（这条曾是真漏洞，由 `license-demo.test.ts` 与包内 `entitlement.test.ts` 锁住）
3. 在 `app.ts`「业务路由汇总」处 `if (licenseClient) routes.route('/api/license-demo', buildLicenseDemoRoutes(licenseClient, todoRepo))`
   ——配了 `GENUINE_SERVER` 才挂，与层级 5 的渐进式装配一致
4. `requireFeature` 与全局 `licenseGuard` 叠加：guard 管到期/停服的全局处置，requireFeature
   管逐点能力开关。guard 先判"该不该全站/核心拦"，放行后再由 requireFeature 判"这条端点签给你了没"

**本地验证**（不依赖真中心）：`license-demo.test.ts` 用桩 client 穷尽了"有/无 feature、
验签通过/失败、未注册"各分支的 200/403。要端到端验证则起真 genuine（https 公网可达）。

配置样例有两份，都由 `pnpm gen:env` 从 `configSpecs` 生成（配置即文档，不会漂）：

- `.env.example` —— 真实环境变量
- `config/homura.config.env.example` —— **随产物携带的配置文件**（密钥投递通道）

## 构建与部署

```bash
pnpm build            # dist/client + dist/server/index.mjs（node 直接跑）
pnpm start            # node dist/server/index.mjs
```

⚠ `@homurajs/*` 是源码直出包，必须打进 bundle（`noExternal`），否则运行时会去 import `.ts` 而崩。
⚠ 产物不是单文件：tsdown/rolldown 会代码分割成多个 chunk。自包含性成立（真实 import 的裸包只剩 Node 内置）。

置于反向代理后（公网 https）时设 `TRUST_PROXY=1`（cookie 自动置 Secure）。

## 开发

```bash
pnpm dev          # Vite 前端（/api /auth /files 代理到 :3000，零 CORS）
pnpm dev:server   # tsx watch 服务端（另开终端，:3000）
pnpm db:generate  # 双方言迁移生成（drizzle/pg + drizzle/sqlite）
pnpm gen:env      # 从 configSpecs 重新生成两份配置样例
pnpm test         # parity（schema 一致性）+ env/store 单测 + e2e 冒烟（全链路 app.request）
```

## 改业务 schema

只写 `src/server/schema/pg.ts` 与 `sqlite.ts` 两份，parity 测试锁一致。新增一张业务表：

- `pg.ts` / `sqlite.ts`：各加表定义，并**登记进 `pgSchema` / `sqliteSchema` 对象**（没登记就不参与迁移）
- `schema/parity.test.ts`：表名集合断言会红，按提示补上新表名（这是刻意的硬门禁）
- repo：新建 `xxx-repo.ts`，复用 `@homurajs/db` 导出的 `DrizzleQueryable`（别再复制一份接口定义）；
  然后在 `app.ts` 的「业务路由汇总」处 `routes.route('/api', buildXxxRoutes(repo))` 挂载
- `pnpm db:generate` 生成迁移

## 派生新 App

复制本模板 → 改 schema（两份手写 + 登记进 `pgSchema`/`sqliteSchema`、`parity.test.ts`
的表名断言）→ `pnpm db:generate` → 写 repo 与路由 → 按需增删 env 开关 → `pnpm build` 部署。
契约文件（`auth/src/types.ts`、`3p/src/index.ts`、`license/src/contract.ts`）勿改。

**新 repo 的接线样板**（照 `todos-repo.ts` + `routes/api.ts` + `app.ts` 三处）：

```ts
// xxx-repo.ts：一个接口 + 一个构造器
export interface BookmarkRepo {
  list(ownerSub: string | null): Promise<Bookmark[]> /* ... */
}
export function buildBookmarkRepo(db: Database, dialect: 'sqlite' | 'pg'): BookmarkRepo {
  const q = db as unknown as DrizzleQueryable // 从 @homurajs/db 导入，别自己复制接口定义
  /* ... */
}

// routes/bookmarks.ts：工厂收 repo，不感知方言
export function buildBookmarkRoutes(repo: BookmarkRepo): Hono {
  /* ... */
}

// app.ts「业务路由汇总」处挂载
routes.route('/api', buildBookmarkRoutes(bookmarkRepo))
```

新导出必有 colocate 测试（`xxx-repo.test.ts`）——AGENTS.md 的全局规则，别因为"只是照抄 todos"跳过。
