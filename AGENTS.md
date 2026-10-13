# AGENTS.md

homura：Hono+React 全栈 template/SDK monorepo。派生 App 的能力都来自 `packages/*`，组装方式看 `templates/hono-react`（活文档）。

## 概述

- 本项目是什么：AI 开发的轻应用基础能力 SDK + 起步模板，App 双形态部署（standalone / qw-pages）

## 边界与范围

- 范围内：渐进式能力包（core/db/storage/auth/3p/license/app-kit）、模板、契约文档
- 非目标：多租户平台、低代码、可视化编辑器、CPaaS、OAuth 服务端（归 ../oauth2-dingtalk）、中央授权服务（归 ../homura-genuine）

## Agent 操作指南

- 如何理解本项目：先读本文件的「能力 × 形态支持矩阵」，再读 docs/ARCHITECTURE.md（包依赖图与装配链），然后读 templates/hono-react 内目标能力的使用示范
- 要部署到 qw-pages：照 templates/hono-react/README.md 的「部署到 qw-pages（runbook）」逐步走；平台契约的实测依据在 docs/specs/module-qw-pages.md

- 全局规则 / 约定：
  - **渐进式耦合是最高设计原则**：任何能力包不得硬依赖其他能力包（app-kit 只依赖 hono+core）；可选依赖走 peer + 动态 import + 子路径导出
  - 依赖方向：core ← 其余包；auth/license 可依赖 @homurajs/db 的 schema-helpers；禁止反向依赖
  - **契约文件不许随手改**：`auth/src/types.ts`（OAuth2 上游）、`3p/src/index.ts`（平台能力契约）、`license/src/contract.ts`（genuine 契约）——修改需同步对应外部 repo 并过快照测试。其中 `license/src/contract.ts` 与 `../homura-genuine/src/contract.ts` 必须**逐字一致**（含 `canonicalize` / `normalizePem` / `verifyEntitlement`：它们决定签名字节与 keyId，不一致等于验签静默失效），genuine 侧的 `contract-parity.test.ts` 会报出首个不同行号；同步方式是 `cp` 覆盖，**不要手工合并**
  - drizzle-orm / drizzle-kit 版本精确锁 `1.0.0-rc.4`（根 pnpm.overrides 强制），drizzle import 尽量收敛在 @homurajs/db
  - TS strict 全开（含 noUncheckedIndexedAccess）；测试与实现同文件 colocate（`*.test.ts`）
  - 新导出必有测试；外呼类构造函数一律收 `fetchImpl` 注入口，测试不 mock 全局 fetch
  - **schema 三份同源，但只手写两份**：App 写 colocated `schema/pg.ts` + `schema/sqlite.ts`（`pgCol/sqliteCol` 配方 + parity 门禁）；REST 侧的表描述符由 `restSchemaFromPg(pgSchema)` **派生**，禁止手写第三份——PostgREST 用的就是 PG 真实列名，而 `pgCol` 不传 name 时列名是 camelCase（`ownerSub`/`createdAt`），手写必漂移
  - **数据方言三选一，别在 App 里硬编码**：`sqlite`（standalone 单机）/ `pg`（standalone + 自建 pgsql 或自托管 supabase）/ `rest`（qw-pages，PostgREST）。缺省由模板 `resolveDialect()` 按运行形态解析
  - **形态相关常量单点定义**：健康检查路径走 core 的 `healthzPathFor(target)`——qw-pages 是 `/_healthz`，因为 `/healthz` 被平台网关占用（网关自答 `ok`，请求不下发到 App）。app-kit 注册路由与 license guard 豁免清单同源读取，改一处必须同步
  - **qw-pages 的配置与密钥走随产物携带的 `config/homura.config.env`**（平台无自定义 env 注入口）；真实 env 优先于文件；`SESSION_SECRET` 沿用仓库公开缺省值时，生产/Pages 形态**启动即拒绝**
  - 文档全 UTF-8 简体中文；git commit 遵循 Conventional Commits（type/scope 英文、描述简体中文、subject ≤72 字符）
  - 旧 Suzuran 已归档：`git show archive/suzuran-final:<path>` 考古，勿恢复旧代码

## 能力 × 形态支持矩阵（写代码前先看这张表）

Agent 最常犯的错误是拿 standalone 的直觉写 qw-pages 部署。下表是 2026-10-13 线上实测的结论，逐项依据见 `docs/specs/module-qw-pages.md`。

| 能力                                   | standalone          | qw-pages        | 说明                                                                                                                                           |
| -------------------------------------- | ------------------- | --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| core（探测/配置/日志/TtlKv/env-file）  | ✅                  | ✅              | Pages 上形态探测依赖 `QWENWORK_WRITABLE_DIR` / `SUPABASE_INSTANCE_ID`                                                                          |
| app-kit（装配/监听/静态/SPA fallback） | ✅                  | ✅              | 两形态都由 App 自己监听 `PORT`+`HOST`；健康检查路径不同                                                                                        |
| db · `rest`（PostgREST）               | ⚪ 可用但无必要     | ✅ **唯一可行** | 表与 RLS policy 必须部署期用受控迁移建（App 无 DDL 权限）                                                                                      |
| db · `sqlite`                          | ✅                  | ❌              | Pages 应用根只读（`mkdir ./data` → EACCES），唯一可写区跨发布清空 → 数据必丢                                                                   |
| db · `pg` 直连                         | ✅                  | ❌              | Pages 不下发 PG 凭据、无注入口，且 5432 出网 timeout（仅 443 放行）                                                                            |
| auth（登录链）                         | ✅                  | 🟡              | `/auth/login` 已线上验证 302；`/auth/callback` 待真实 IdP 联调                                                                                 |
| license（到期 / 停服 / 功能范围）      | ✅ 已双端联调       | 🟡              | standalone 八阶段生命周期实测通过（真 genuine 进程）；Pages 侧未验证——需 genuine 以 https 公网可达，且 `createRestStateStore` 未在部署态执行过 |
| 3p（钉钉消息/审批/通讯录）             | ✅                  | ⚪ 未测         | 凭据可经配置文件投递；出网到钉钉域名未验证                                                                                                     |
| storage · `local`                      | ✅                  | ❌              | 默认 `./data/files` 在 Pages 不可写（首次上传才 EACCES，健康检查照报 ok）；改指可写区也跨发布清空                                              |
| storage · `supabase`                   | ✅（自建 supabase） | ❌              | Pages 上 anon 无建桶权（RLS 403），受控迁移角色对 `storage` schema 也无权（42501）→ 桶建不出来                                                 |
| storage · `s3`                         | ✅                  | ⚠️ 理论可行     | 需 App 自行安装两个 optional peer（`@aws-sdk/client-s3`、`s3-request-presigner`）；凭据走配置文件；S3 端点出网未验证                           |

图例：✅ 已验证可用 · 🟡 代码就绪但未端到端验证 · ⚪ 未测 · ⚠️ 有前置条件 · ❌ 平台限制导致不可用

**Pages 部署五条必知**：① 健康检查用 `/_healthz`，`/healthz` 是网关的（本地跑同一产物时形态是 standalone，注册的仍是 `/healthz`）；② 表要在部署期建：模板缺省四张（`todos`/`refresh_tokens`/`license_state`/`homura_ttlkv`）**加上你新增的每张业务表**，逐张都要 anon policy，漏了是静默失败；③ 密钥放 `config/homura.config.env`，别指望 env 注入；④ 别把 `assetsDir` 指到产物根，否则服务端源码会变成可下载的静态文件；⑤ 平台会改写 HTML 响应（注入页面 chrome 并覆盖 `Cache-Control`），别依赖 HTML 的字节长度或 ETag。

## 目录速查

- `packages/core` — 基座：runtime 探测 / HEALTHZ_PATH / defineConfig / env-file（配置文件投递）/ logger / TtlKv
- `packages/db` — Drizzle 双 driver 工厂（sqlite 内置、pg 走 `./pg` 子路径注册）、双方言配方与 parity、迁移双轨、supabase Supavisor 直连（**仅自托管**）、**PostgREST 层**（`createRestDb` / `restSchemaFromPg` 派生 / `createRestTtlKv`，qw-pages 唯一数据路径）
- `packages/storage` — 三后端对象存储（local/s3/supabase）+ /files 代理路由；⚠ 三后端在 qw-pages 上均不可用，见支持矩阵
- `packages/auth` — 通用 OAuth2 客户端 + 自管 session（`./hono`、`./tables` 子路径）；session store 有 drizzle 与 PostgREST 两版
- `packages/3p` — 第三方平台能力分片抽象 + 钉钉实现（`./dingtalk` 子路径）
- `packages/license` — 激活心跳客户端（Ed25519 验签 + 本地到期判定）+ 四档处置守卫 + `requireFeature` 功能范围闸门（`./contract` 契约、`./hono` 守卫）；state store 有 drizzle 与 PostgREST 两版
- `packages/app-kit` — createApp 渐进式装配 + RuntimeAdapter（`./serve`、`./qw-pages`；两形态都自监听端口，差异只在缺省值）
- `templates/hono-react` — 全栈模板（活文档：每能力都有使用示范 + 部署 runbook）
- `docs/` — PRD / ARCHITECTURE / DECISIONS / specs / heritage
