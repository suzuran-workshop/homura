# template-hono-react

homura 全栈模板：Hono + React + Vite，**AI 开发的起点与活文档**——每个能力包在这里都有使用示范。

> **派生 App 前先读 `AGENTS.md` 的「能力 × 形态支持矩阵」。** qw-pages 上有几项能力不可用
> （storage 三后端全倒、sqlite/pg 方言不可用、`/healthz` 归网关），照 standalone 的直觉写会踩坑。

## 渐进式装配

装配核心是 `src/server/app.ts` 的 `buildApp(config, overrides)`：从 `src/server/env.ts`
的 `configSpecs`（defineConfig）读出「启用了哪些能力」，逐级注入 `createApp`。
每能力一组独立 env，缺省则不启用——从零能力到全家桶：

| 层级 | 开关 env                                     | 解锁                                     | 装配文件            |
| ---- | -------------------------------------------- | ---------------------------------------- | ------------------- |
| 0    | 无                                           | 纯 routes + 健康检查 + 静态 SPA          | app.ts              |
| 1    | `DIALECT=sqlite\|pg\|rest`（缺省按形态解析） | db + schema + 迁移/探活                  | db.ts / schema/     |
| 2    | `OAUTH_DINGTALK_ORG_ID`                      | 钉钉登录（oauth2-dingtalk）+ session     | app.ts buildAuth    |
| 3    | `DINGTALK_APP_KEY`+`_SECRET`                 | 平台消息/审批/通讯录（3p 能力协商）      | routes/platform.ts  |
| 4    | `STORAGE_BACKEND=local\|s3\|supabase`        | 图床/文件（⚠ qw-pages 上三后端均不可用） | routes/files.ts     |
| 5    | `GENUINE_SERVER`                             | 激活心跳 + 停服守卫                      | app.ts buildLicense |

`DIALECT` 通常**不用填**：`resolveDialect()` 会按运行形态取缺省（standalone → `sqlite`，
qw-pages → `rest`）。在 qw-pages 上显式填 `sqlite` 或 `pg` 会启动即抛可行动错误——那是故意的，
因为这两条路在该形态必然失败（应用根只读 / 无 PG 凭据且 5432 出网被封）。

配置样例有两份，都由 `pnpm gen:env` 从 `configSpecs` 生成（配置即文档，不会漂）：

- `.env.example` —— standalone 用的真实环境变量
- `config/homura.config.env.example` —— qw-pages 用的**随产物携带的配置文件**（平台无 env 注入口）

## 双形态

```bash
pnpm build            # standalone：dist/client + dist/server/index.mjs（node 直接跑）
pnpm build:qw-pages   # qw-pages：dist/ 整个目录上传（含 homura.manifest.json 与配置文件）
```

两形态 99% 共用（同一 `buildApp`），差异只有三处：入口（`index.ts` / `qw-pages.ts`，**两者都自己监听端口**）、
打包策略、静态目录缺省值（`dist/client` / `client`）。

⚠ `@homurajs/*` 是源码直出包，两形态都必须打进 bundle（`noExternal`），否则运行时会去 import `.ts` 而崩。
⚠ qw-pages 产物**不是单文件**：tsdown/rolldown 会代码分割，实测 30 个文件 / 2.1MB。
自包含性成立（真实 import 的裸包只剩 Node 内置），但别按"一个 .mjs"去假设。

平台契约的全部实测依据见 `docs/specs/module-qw-pages.md`。

## 部署到 qw-pages（runbook）

前置：Page 已 provision 数据库（受控工具会返回 domain）。

1. **填配置**：`cp config/homura.config.env.example config/homura.config.env`，至少改
   `SESSION_SECRET`（>=32B 随机值；沿用仓库公开缺省值会**启动即拒绝**），按需填 `OAUTH_*`。
   该文件已被 `.gitignore` 忽略，`build:qw-pages` 会把它拷进 `dist/`。
2. **改业务 schema**：只写 `src/server/schema/pg.ts` 与 `sqlite.ts` 两份；`schema/rest.ts` 由
   `restSchemaFromPg` 自动派生，**不要手写第三份**。
3. **生成迁移**：`pnpm db:generate`（产出 `drizzle/pg/` 与 `drizzle/sqlite/`）。
4. **建表 + policy**（App 无 DDL 权限，必须部署期做）：把 `drizzle/pg/<最新>/migration.sql`
   改成幂等（`CREATE TABLE IF NOT EXISTS`、`DROP POLICY IF EXISTS` + `CREATE POLICY`），
   用 `qwenwork_pages_apply_migration` 执行；再加上 `homura_ttlkv`（OAuth state 用）：

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

   **每张表都要 RLS policy**，否则是静默失败：`SELECT` 返回 `200 []`（看着像空库），
   `INSERT` 返回 **401** + PG code `42501`（不是 403）。启用 auth 与 license 时共需四张表：
   `todos` / `refresh_tokens` / `license_state` / `homura_ttlkv`。

5. **构建**：`pnpm build:qw-pages`。
6. **发布**：`qwenwork_pages_publish`，参数 `category: "dynamic"`、`entrypoint: "server/index.mjs"`、
   `port: 8081`、`with_database: true`、`file_path` 指向 `dist/`。
7. **验证**：`GET /_healthz` 应为 `{"status":"ok","runtime":"qw-pages","checks":{"db":"ok"}}`。
   注意 `GET /healthz` 返回的 `ok`（text/plain）是**平台网关**答的，与本 App 无关。

### 排错速查

| 症状                                                              | 原因                                         | 处理                                                                                                  |
| ----------------------------------------------------------------- | -------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| 启动抛「PostgREST 探活失败」或 `/_healthz` 的 `checks.db` 为 fail | 表没建 / policy 没给                         | 回第 4 步。`404` = 表没建；`401`+`42501` = 缺 policy                                                  |
| 启动抛 `SESSION_SECRET 仍是仓库里公开的缺省值`                    | 没填配置                                     | 在 `config/homura.config.env` 给 >=32B 随机值                                                         |
| 启动抛 `DIALECT=sqlite 在 qw-pages 上不可用`                      | 显式设了方言                                 | 删掉 `DIALECT`，让它自动解析为 `rest`                                                                 |
| 数据能写但重发布后没了                                            | 用了本地文件                                 | Pages 上任何本地路径都不持久（应用根只读、可写区跨发布清空）；数据只能进 PostgREST                    |
| 上传文件报 EACCES，但 `/_healthz` 是 ok                           | `STORAGE_BACKEND=local` 且目录在只读的应用根 | Pages 上别用 local（mkdir 发生在每次上传时，健康检查覆盖不到）；改 s3（需自装 peer）或不用 storage    |
| 页面能开但 `/assets/*` 404                                        | `HOMURA_ASSETS_DIR` 指错                     | 缺省是 `<cwd>/client`（= 产物里的 `dist/client`）；别指到产物根，否则服务端源码会变成可下载的静态文件 |
| 登录 302 出去了但回调失败                                         | `OAUTH_REDIRECT_URI` 与 IdP 侧登记不一致     | 填 Page 的公网地址 + `/auth/callback`                                                                 |

## 开发

```bash
pnpm dev          # Vite 前端（/api /auth /files 代理到 :3000，零 CORS）
pnpm dev:server   # tsx watch 服务端（另开终端，:3000）
pnpm db:generate  # 双方言迁移生成（drizzle/pg + drizzle/sqlite）
pnpm gen:env      # 从 configSpecs 重新生成两份配置样例
pnpm test         # parity（schema 一致性）+ env/db/store 单测 + e2e 冒烟（全链路 app.request）
```

## 派生新 App

复制本模板 → 改 `src/server/schema/{pg,sqlite}.ts` 业务表（rest 侧自动派生）→ `pnpm db:generate` →
在 `routes/` 加业务路由 → 按需增删 env 开关 → 部署照上面的 runbook 走。
契约文件（`auth/src/types.ts`、`3p/src/index.ts`、`license/src/contract.ts`）勿改。

新增表时记得：REST 形态的表要在部署期一并建好并给 policy，否则运行时会撞上表里的静默失败。
