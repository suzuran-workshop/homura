# template-hono-react

homura 全栈模板：Hono + React + Vite，**AI 开发的起点与活文档**——每个能力包在这里都有使用示范。

> **派生 App 前先读 `AGENTS.md` 的「能力 × 形态支持矩阵」。** qw-pages 上有几项能力不可用
> （storage 三后端全倒、sqlite/pg 方言不可用、`/healthz` 归网关），照 standalone 的直觉写会踩坑。

## 渐进式装配

装配核心是 `src/server/app.ts` 的 `buildApp(config, overrides)`：从 `src/server/env.ts`
的 `configSpecs`（defineConfig）读出「启用了哪些能力」，逐级注入 `createApp`。
每能力一组独立 env，缺省则不启用——从零能力到全家桶：

| 层级 | 开关 env                                     | 解锁                                                       | 装配文件            |
| ---- | -------------------------------------------- | ---------------------------------------------------------- | ------------------- |
| 0    | 无                                           | 纯 routes + 健康检查 + 静态 SPA                            | app.ts              |
| 1    | `DIALECT=sqlite\|pg\|rest`（缺省按形态解析） | db + schema + 迁移/探活                                    | db.ts / schema/     |
| 2    | `OAUTH_DINGTALK_ORG_ID`                      | 钉钉登录（oauth2-dingtalk）+ session                       | app.ts buildAuth    |
| 3    | `DINGTALK_APP_KEY`+`_SECRET`                 | 平台消息/审批/通讯录（3p 能力协商）                        | routes/platform.ts  |
| 4    | `STORAGE_BACKEND=local\|s3\|supabase`        | 图床/文件（⚠ qw-pages 上三后端均不可用）                   | routes/files.ts     |
| 5    | `GENUINE_SERVER`（+ `GENUINE_PUBLIC_KEY`）   | 激活心跳 + Ed25519 验签 + 到期/停服四档处置 + 功能范围闸门 | app.ts buildLicense |

`DIALECT` 通常**不用填**：`resolveDialect()` 会按运行形态取缺省（standalone → `sqlite`，
qw-pages → `rest`）。在 qw-pages 上显式填 `sqlite` 或 `pg` 会启动即抛可行动错误——那是故意的，
因为这两条路在该形态必然失败（应用根只读 / 无 PG 凭据且 5432 出网被封）。

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
验签通过/失败、未注册"各分支的 200/403。要端到端验证则照 `docs/specs/module-qw-pages.md`
的「license 端到端联调」起真 genuine + 隧道。

配置样例有两份，都由 `pnpm gen:env` 从 `configSpecs` 生成（配置即文档，不会漂）：

- `.env.example` —— standalone 用的真实环境变量
- `config/homura.config.env.example` —— qw-pages 用的**随产物携带的配置文件**（平台无 env 注入口）

## 双形态

```bash
pnpm build            # standalone：dist/client + dist/server/index.mjs（node 直接跑）
pnpm build:qw-pages   # qw-pages：dist/ 整个目录上传（含 homura.manifest.json 与配置文件）
```

两形态 99% 共用（同一 `buildApp`），差异有四处：入口（`index.ts` / `qw-pages.ts`，**两者都自己监听端口**）、
打包策略、静态目录缺省值（`dist/client` / `client`）、**健康检查路径**（`/healthz` / `/_healthz`，
由 core 的 `healthzPathFor` 按形态给出）。

⚠ `@homurajs/*` 是源码直出包，两形态都必须打进 bundle（`noExternal`），否则运行时会去 import `.ts` 而崩。
⚠ qw-pages 产物**不是单文件**：tsdown/rolldown 会代码分割，实测约 30 个文件 / 2.1MB
（**具体数量随代码增删漂移，别当断言用**）。自包含性成立（真实 import 的裸包只剩 Node 内置），
但别按"一个 .mjs"去假设。

平台契约的全部实测依据见 `docs/specs/module-qw-pages.md`。

## 部署到 qw-pages（runbook）

前置：Page 已 provision 数据库。`qwenwork_pages_provision_database` 的返回值里有 `domain`
（形如 `xxxxxxxx.qwenwork.host`）——**后面第 4 步的 `apply_migration` 和第 6 步的发布都靠它定位 Page**，
先记下来。Page 已存在时不必重复 provision（桌面端会把本会话钉在同一个 Page 上）。

1. **填配置**：`cp config/homura.config.env.example config/homura.config.env`，按需填 `OAUTH_*`；
   **启用登录时必须改 `SESSION_SECRET`**（>=32B 随机值；沿用仓库公开缺省值会被启动期断言拒绝）。
   不启用 auth 的纯匿名 App 可以不改。该文件已被 `.gitignore` 忽略，`build:qw-pages` 会把它拷进 `dist/`。
2. **改业务 schema**：只写 `src/server/schema/pg.ts` 与 `sqlite.ts` 两份，`schema/rest.ts` 由
   `restSchemaFromPg` 自动派生，**不要手写第三份**。但派生不等于全自动，新增一张业务表要动四处：
   - `pg.ts` / `sqlite.ts`：各加表定义，并**登记进 `pgSchema` / `sqliteSchema` 对象**（没登记就派生不出来，也不参与迁移）
   - `schema/rest.ts`：用 `must('键名')` 取出描述符，并**加进 `restBusinessTables`**
     → 部署期探活与 `/_healthz` 的 db 检查会自动覆盖它（不登记则缺表时健康检查照报 ok，只在业务请求时静默失败）
   - `schema/parity.test.ts`：表名集合断言会红，按提示补上新表名（这是刻意的硬门禁）
   - repo：新建 `xxx-repo.ts`，SQL 形态复用 `@homurajs/db` 导出的 `DrizzleQueryable`（别再复制一份接口定义），
     REST 形态照 `buildRestTodoRepo` 写；然后在 `app.ts` 的「业务路由汇总」处 `routes.route('/api', buildXxxRoutes(repo))` 挂载
3. **生成迁移**：`pnpm db:generate`（产出 `drizzle/pg/` 与 `drizzle/sqlite/`）。
4. **建表 + policy**（App 无 DDL 权限，必须部署期做）：按目录时间序把 `drizzle/pg/` 下
   **全部**迁移的 SQL 都应用一遍——⚠ 不是只应用最新那份：首次部署时最新那份只含你刚加的表，
   基础表（`todos`/`refresh_tokens`/`license_state`）在更早的目录里，漏了会启动探活失败。
   改成幂等（`CREATE TABLE IF NOT EXISTS`、`DROP POLICY IF EXISTS` + `CREATE POLICY`）后
   用 `qwenwork_pages_apply_migration`（传第 0 步记下的 `domain`）执行；启用 auth 时再加 `homura_ttlkv`：

   ```sql
   CREATE TABLE IF NOT EXISTS "homura_ttlkv" (
     "key" text PRIMARY KEY,
     "value" text NOT NULL,
     "expires_at" integer NOT NULL
   );
   ALTER TABLE "homura_ttlkv" ENABLE ROW LEVEL SECURITY;
   DROP POLICY IF EXISTS homura_anon_all ON "homura_ttlkv";
   CREATE POLICY homura_anon_all ON "homura_ttlkv"
     FOR ALL TO anon USING (true) WITH CHECK (true);
   GRANT SELECT, INSERT, UPDATE, DELETE ON "homura_ttlkv" TO anon;
   ```

   启用多凭证身份时还需这四张表——但**按你实际开的能力取用**（三类认证均 opt-in，配了啥才启用啥）：
   任何认证形态都要 `users`（本地身份锚点）+ `refresh_tokens`（session，已在上面的迁移里）；OAuth2 用
   `oauth2_identity_links`、WebAuthn 用 `webauthn_credentials`、二者任一还需 `homura_ttlkv`（state/challenge）；
   密码认证用 `passwords`。`app.ts` 的 `requiredTables` 是权威映射（部署期探活与 `/_healthz` 按它逐张 ping）。
   ⚠ 这四张的 `CREATE TABLE` **已由 `pnpm db:generate` 产出的迁移包含**（`drizzle/pg/` 里按时间序应用即
   全部建出，见上）——下面这段是「幂等兜底 + 补 RLS policy」：drizzle 迁移**不生成 policy**，故你**用到的**
   每张表仍须单独 `CREATE POLICY` + `GRANT`。列类型与迁移严格对齐（`users.id` / `oauth2_identity_links.id`
   是 `uuid DEFAULT gen_random_uuid()`，username 唯一性走唯一索引而非 inline UNIQUE——与 sqlite 侧对称，见 module-password.md）：

   ```sql
   CREATE TABLE IF NOT EXISTS "users" (
     "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
     "username" text,
     "nickname" text,
     "avatar_url" text,
     "created_at" bigint NOT NULL,
     "updated_at" bigint NOT NULL
   );
   CREATE UNIQUE INDEX IF NOT EXISTS users_username_uidx ON "users" ("username");
   ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;
   DROP POLICY IF EXISTS homura_anon_all ON "users";
   CREATE POLICY homura_anon_all ON "users" FOR ALL TO anon USING (true) WITH CHECK (true);
   GRANT SELECT, INSERT, UPDATE, DELETE ON "users" TO anon;

   CREATE TABLE IF NOT EXISTS "passwords" (
     "user_id" text PRIMARY KEY,
     "password_hash" text NOT NULL,
     "created_at" bigint NOT NULL,
     "updated_at" bigint NOT NULL
   );
   ALTER TABLE "passwords" ENABLE ROW LEVEL SECURITY;
   DROP POLICY IF EXISTS homura_anon_all ON "passwords";
   CREATE POLICY homura_anon_all ON "passwords" FOR ALL TO anon USING (true) WITH CHECK (true);
   GRANT SELECT, INSERT, UPDATE, DELETE ON "passwords" TO anon;

   CREATE TABLE IF NOT EXISTS "oauth2_identity_links" (
     "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
     "user_id" text NOT NULL,
     "provider" text NOT NULL,
     "provider_sub" text NOT NULL,
     "raw_profile" text,
     "created_at" bigint NOT NULL
   );
   CREATE UNIQUE INDEX IF NOT EXISTS oauth2_links_provider_sub_uidx
     ON "oauth2_identity_links" ("provider", "provider_sub");
   ALTER TABLE "oauth2_identity_links" ENABLE ROW LEVEL SECURITY;
   DROP POLICY IF EXISTS homura_anon_all ON "oauth2_identity_links";
   CREATE POLICY homura_anon_all ON "oauth2_identity_links"
     FOR ALL TO anon USING (true) WITH CHECK (true);
   GRANT SELECT, INSERT, UPDATE, DELETE ON "oauth2_identity_links" TO anon;

   CREATE TABLE IF NOT EXISTS "webauthn_credentials" (
     "id" text PRIMARY KEY,
     "user_id" text NOT NULL,
     "public_key" text NOT NULL,
     "counter" integer NOT NULL,
     "device_type" text NOT NULL,
     "backed_up" integer NOT NULL,
     "transports" text,
     "display_name" text,
     "created_at" bigint NOT NULL
   );
   ALTER TABLE "webauthn_credentials" ENABLE ROW LEVEL SECURITY;
   DROP POLICY IF EXISTS homura_anon_all ON "webauthn_credentials";
   CREATE POLICY homura_anon_all ON "webauthn_credentials"
     FOR ALL TO anon USING (true) WITH CHECK (true);
   GRANT SELECT, INSERT, UPDATE, DELETE ON "webauthn_credentials" TO anon;
   ```

   **每张表都要 RLS policy**，否则是静默失败：`SELECT` 返回 `200 []`（看着像空库），
   `INSERT` 返回 **401** + PG code `42501`（不是 403）。需要建哪些表由 `app.ts` 的 `requiredTables`
   决定：模板缺省是 `todos`，启用 auth 追加 `refresh_tokens` + `homura_ttlkv`，启用 license 追加
   `license_state`，**你新增的每张业务表都要算进去**（登记进 `restBusinessTables` 即自动纳入）。
   那四张表都没有 serial 序列；若有，`GRANT ... ON ALL SEQUENCES IN SCHEMA current_schema()` 是语法错误，
   要在 DO 块里 `EXECUTE format(...)` 逐条授权。

5. **构建**：`pnpm build:qw-pages`。
6. **发布**：`qwenwork_pages_publish`，参数 `category: "dynamic"`、`entrypoint: "server/index.mjs"`、
   `port: 8081`、`with_database: true`、`file_path` 指向 `dist/`。
7. **验证**：对**线上 URL** 请求 `GET /_healthz`，应为
   `{"status":"ok","runtime":"qw-pages","checks":{"db":"ok"}}`。
   - `GET /healthz` 返回的 `ok`（text/plain）是**平台网关**答的，与本 App 无关
   - ⚠ 这条验证只对线上成立：同一个 qw-pages 产物在**本地**跑时，形态探测结果是 standalone，
     注册的是 `/healthz` 而不是 `/_healthz`（本地打 `/_healthz` 会 404，属正常）
8. **测试**：`pnpm test`。新导出的 repo / 路由必须有 colocate 测试（AGENTS.md 全局规则），
   别因为"只是照抄 todos"就跳过。

### 排错速查

| 症状                                                              | 原因                                               | 处理                                                                                                                                                                                |
| ----------------------------------------------------------------- | -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 启动抛「PostgREST 探活失败」或 `/_healthz` 的 `checks.db` 为 fail | 表没建 / policy 没给                               | 回第 4 步。`404` = 表没建；`401`+`42501` = 缺 policy                                                                                                                                |
| 启动抛 `SESSION_SECRET 仍是仓库里公开的缺省值`                    | 没填配置                                           | 在 `config/homura.config.env` 给 >=32B 随机值                                                                                                                                       |
| 启动抛 `DIALECT=sqlite 在 qw-pages 上不可用`                      | 显式设了方言                                       | 删掉 `DIALECT`，让它自动解析为 `rest`                                                                                                                                               |
| 数据能写但重发布后没了                                            | 用了本地文件                                       | Pages 上任何本地路径都不持久（应用根只读、可写区跨发布清空）；数据只能进 PostgREST                                                                                                  |
| 上传文件报 EACCES，但 `/_healthz` 是 ok                           | `STORAGE_BACKEND=local` 且目录在只读的应用根       | Pages 上别用 local（mkdir 发生在每次上传时，健康检查覆盖不到）；改 s3（需自装 peer）或不用 storage                                                                                  |
| 页面能开但 `/assets/*` 404                                        | `HOMURA_ASSETS_DIR` 指错                           | 缺省是 `<cwd>/client`（= 产物里的 `dist/client`）；别指到产物根，否则服务端源码会变成可下载的静态文件                                                                               |
| 登录 302 出去了但回调失败                                         | `OAUTH_REDIRECT_URI` 与 IdP 侧登记不一致           | 填 Page 的公网地址 + `/auth/callback`                                                                                                                                               |
| 本地跑 qw-pages 产物时 `/_healthz` 404                            | 本地形态探测结果是 standalone，注册的是 `/healthz` | 正常现象，`/_healthz` 只在线上有效。要在本地模拟 Pages：设 `HOMURA_RUNTIME=qw-pages`（或 `QWENWORK_WRITABLE_DIR`）                                                                  |
| 新增业务表后 Pages 上查询返回空数组或 401，但 `/_healthz` 报 ok   | 表没登记进 `restBusinessTables`，探活没覆盖它      | 在 `schema/rest.ts` 登记；并确认部署期建了该表与 anon policy                                                                                                                        |
| 想上传图片但三后端都不可用                                        | 平台限制（见支持矩阵）                             | 小文件可 base64 存进 PostgREST 的 `jsonb`/`text` 列；大文件走 `STORAGE_BACKEND=s3`（需自装两个 AWS SDK peer、凭据写进 `homura.config.env`，注意出网只放行 443）；或向平台申请预置桶 |

## 开发

```bash
pnpm dev          # Vite 前端（/api /auth /files 代理到 :3000，零 CORS）
pnpm dev:server   # tsx watch 服务端（另开终端，:3000）
pnpm db:generate  # 双方言迁移生成（drizzle/pg + drizzle/sqlite）
pnpm gen:env      # 从 configSpecs 重新生成两份配置样例
pnpm test         # parity（schema 一致性）+ env/db/store 单测 + e2e 冒烟（全链路 app.request）
```

## 派生新 App

复制本模板 → 按 runbook 第 2 步改 schema（**四处必改点**：两份手写 schema + 登记进
`pgSchema`/`sqliteSchema`、`schema/rest.ts` 的 `must()` 与 `restBusinessTables`、
`parity.test.ts` 的表名断言）→ `pnpm db:generate` → 写 repo 与路由 → 按需增删 env 开关 →
部署照 runbook 走。契约文件（`auth/src/types.ts`、`3p/src/index.ts`、`license/src/contract.ts`）勿改。

**新 repo 的接线样板**（照 `todos-repo.ts` + `routes/api.ts` + `app.ts` 三处）：

```ts
// xxx-repo.ts：一个接口 + 两个构造器（SQL 与 REST 各一）
export interface BookmarkRepo {
  list(ownerSub: string | null): Promise<Bookmark[]> /* ... */
}
export function buildBookmarkRepo(db: Database, dialect: 'sqlite' | 'pg'): BookmarkRepo {
  const q = db as unknown as DrizzleQueryable // 从 @homurajs/db 导入，别自己复制接口定义
  /* ... */
}
export function buildRestBookmarkRepo(rest: RestDb): BookmarkRepo {
  /* 列名取自 restSchema 派生描述符 */
}

// routes/bookmarks.ts：工厂收 repo，不感知方言
export function buildBookmarkRoutes(repo: BookmarkRepo): Hono {
  /* ... */
}

// app.ts「业务路由汇总」处挂载（repo 按 dbBundle.kind 二选一构造）
routes.route('/api', buildBookmarkRoutes(bookmarkRepo))
```

新导出必有 colocate 测试（`xxx-repo.test.ts`）——AGENTS.md 的全局规则，别因为"只是照抄 todos"跳过。

新增表时记得：REST 形态的表要在部署期一并建好并给 policy，否则运行时会撞上静默失败
（`SELECT` 返回 `200 []`、`INSERT` 返回 `401`+`42501`）。
