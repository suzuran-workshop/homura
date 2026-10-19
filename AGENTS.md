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
  - 依赖方向：core ← 其余包；auth/license/storage 可依赖 @homurajs/db 的 schema-helpers（storage 仅 `./db` 子路径的 DB-backed 后端用，走 optional peer + 动态 import）；禁止反向依赖
  - **契约文件不许随手改**：`auth/src/types.ts`（OAuth2 上游）、`3p/src/index.ts`（平台能力契约）、`license/src/contract.ts`（genuine 契约）——修改需同步对应外部 repo 并过快照测试。其中 `license/src/contract.ts` 与 `../homura-genuine/src/contract.ts` 必须**逐字一致**（含 `canonicalize` / `normalizePem` / `verifyEntitlement`：它们决定签名字节与 keyId，不一致等于验签静默失效），genuine 侧的 `contract-parity.test.ts` 会报出首个不同行号；同步方式是 `cp` 覆盖，**不要手工合并**
  - drizzle-orm / drizzle-kit 版本精确锁 `1.0.0-rc.4`（根 pnpm.overrides 强制），drizzle import 尽量收敛在 @homurajs/db
  - TS strict 全开（含 noUncheckedIndexedAccess）；测试与实现同文件 colocate（`*.test.ts`）
  - 新导出必有测试；外呼类构造函数一律收 `fetchImpl` 注入口，测试不 mock 全局 fetch
  - **schema 三份同源，但只手写两份**：App 写 colocated `schema/pg.ts` + `schema/sqlite.ts`（`pgCol/sqliteCol` 配方 + parity 门禁）；REST 侧的表描述符由 `restSchemaFromPg(pgSchema)` **派生**，禁止手写第三份——PostgREST 用的就是 PG 真实列名，而 `pgCol` 不传 name 时列名是 camelCase（`ownerSub`/`createdAt`），手写必漂移
  - **数据方言三选一，别在 App 里硬编码**：`sqlite`（standalone 单机）/ `pg`（standalone + 自建 pgsql 或自托管 supabase）/ `rest`（qw-pages，PostgREST）。缺省由模板 `resolveDialect()` 按运行形态解析
  - **形态相关常量单点定义**：健康检查路径走 core 的 `healthzPathFor(target)`——qw-pages 是 `/_healthz`，因为 `/healthz` 被平台网关占用（网关自答 `ok`，请求不下发到 App）。app-kit 注册路由与 license guard 豁免清单同源读取，改一处必须同步
  - **qw-pages 的配置与密钥走随产物携带的 `config/homura.config.env`**（平台无自定义 env 注入口）；真实 env 优先于文件；`SESSION_SECRET` 沿用仓库公开缺省值时，生产/Pages 形态**启动即拒绝**
  - **`package.json` 的 exports 必须与 `tsdown.config.ts` 的 entry 一一对应**：漏了 entry，构建照样"成功"但 dist 少文件，而开发态 exports 指向 `./src/*.ts` 直连源码，本地测试与 CI 全绿，只有 npm 发布产物是坏的（消费方 import 即 `ERR_MODULE_NOT_FOUND`）。一致性由 `scripts/check-package-exports.mjs` 双重门禁把守（test.yml 静态校验 + release.yml 产物校验）。26.10.14/15 的 `@homurajs/storage` 就这样漏发了 `./db`/`./tables`/`./chunk-client`，db 后端是 qw-pages 唯一可用的 storage，等于 Pages 文件存储整个不可用
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
| auth（登录链）                         | ✅                  | 🟡              | 多凭证身份模型（ADR-022）：TextPassword（1:1）+ WebAuthn（1:N）+ OAuth2 identity links（1:N）。OAuth2 路径 `/auth/oauth2/*`（旧 `/auth/login`+`/auth/callback` 已废弃）。PasswordProvider 用 Node 内置 scrypt（零依赖，ADR-023）。WebAuthn 走 `@simplewebauthn/server` optional peer + `./webauthn` 子路径。Identity Resolver JIT 默认开启。session sub = local user ID（Breaking）。qw-pages 侧 OAuth2 callback 待真实 IdP 联调 |
| license（到期 / 停服 / 功能范围）      | ✅ 已双端联调       | ✅ 已实测       | standalone 八阶段生命周期实测通过（真 genuine 进程）；Pages 侧 2026-10-14 用 cloudflared 隧道打通五场景（自注册/心跳/四档 enforcement/到期/停服/rotate keys 造成 invalid sig），`createRestStateStore` 跨发布持久化验证通过。前置：genuine 必须 https 公网可达；隧道 URL 漂了要重发 App |
| 3p（钉钉消息/审批/通讯录）             | ✅                  | ⚪ 未测         | 凭据可经配置文件投递；出网到钉钉域名未验证                                                                                                     |
| storage · `local`                      | ✅                  | ❌              | 默认 `./data/files` 在 Pages 不可写（首次上传才 EACCES，健康检查照报 ok）；改指可写区也跨发布清空                                              |
| storage · `supabase`                   | ✅（自建 supabase） | ❌              | Pages 上 anon 无建桶权（RLS 403），受控迁移角色对 `storage` schema 也无权（42501）→ 桶建不出来                                                 |
| storage · `s3`                         | ✅                  | ✅ 已实测       | 需 App 自行安装两个 optional peer（`@aws-sdk/client-s3`、`s3-request-presigner`，模板已列 devDep）；凭据走配置文件。2026-10-14 真阿里云 OSS 在 Pages 部署态实测：整文件 `/api/upload`（服务端 PutObject）+ `/api/files` 列举（ListObjectsV2）+ `/files` 代理下载（Pages→OSS 443 出网）全部逐字节一致。⚠ **OSS 必须 `S3_FORCE_PATH_STYLE=false`**（virtual-hosted） |
| storage · `db`（DB-backed 分块）       | ✅                  | ✅ **唯一可用** | 二进制**分块** base64 存进 `homura_files`（清单）+ `homura_file_chunks`（数据）走 PostgREST。强制分块（每块 raw≤384KB→base64 512KB）绕开网关 body 上限（实测 ≥1MB 413）与 PostgREST 单值限（~1MB）；2026-10-14 实测 3MB 分 8 块上传 + 流式下载逐字节一致。可配总上限缺省 50MB（非无限，DB 存 blob 是反模式）。`data` 列是 **text 不是 bytea**（PostgREST bytea 编解码不可靠，实测 308B→618B mojibake）。两表须部署期迁移预建。见 ADR-021 |
| storage · `s3` 预签名直传              | ✅                  | ✅ 大文件正解   | `getSignedUploadUrl`（预签名 PUT）+ `/api/files/presign` + 客户端 `uploadViaPresign`：浏览器直传 OSS/S3，字节不过 App/网关 → 绕开 body 上限且不膨胀 DB。2026-10-14 真阿里云 OSS 实测通过（预签名 PUT 3MB→200、downloadFile 回读逐字节一致、预签名 GET 200）。⚠ **OSS 必须 `S3_FORCE_PATH_STYLE=false`**（virtual-hosted，否则 SecondLevelDomainForbidden）；浏览器直传需桶配 CORS |

图例：✅ 已验证可用 · 🟡 代码就绪但未端到端验证 · ⚪ 未测 · ⚠️ 有前置条件 · ❌ 平台限制导致不可用

**Pages 部署五条必知**：① 健康检查用 `/_healthz`，`/healthz` 是网关的（本地跑同一产物时形态是 standalone，注册的仍是 `/healthz`）；② 表要在部署期建，且**按实际启用的能力逐张建**（`app.ts` 的 `requiredTables` 是权威映射；缺表/缺 anon policy 是静默失败）：业务表（`todos` + 你新增的，登记进 `restBusinessTables`）总是要；**任何**认证形态加 `refresh_tokens` + `users`（本地身份锚点）；OAuth2 加 `oauth2_identity_links`、WebAuthn 加 `webauthn_credentials`、二者任一还需 `homura_ttlkv`（OAuth2 state / WebAuthn challenge）；密码认证加 `passwords`；启用 license 加 `license_state`；`STORAGE_BACKEND=db` 加 `homura_files` + `homura_file_chunks`（`data` 列是 text）。⚠ 三类认证均 **opt-in**（密码 `AUTH_PASSWORD_ENABLED` / WebAuthn `AUTH_WEBAUTHN_ENABLED` 缺省关，OAuth2 靠 `OAUTH_DINGTALK_ORG_ID`）——配了啥才启用啥、才需要建对应表；旧实现把 `refresh_tokens` 只挂 OAuth2、四张身份表只挂密码/WebAuthn，会让纯密码部署漏 `refresh_tokens`、纯 OAuth2 部署漏 `users`/`oauth2_identity_links`；③ 密钥放 `config/homura.config.env`，别指望 env 注入；④ 别把 `assetsDir` 指到产物根，否则服务端源码会变成可下载的静态文件；⑤ 平台会改写 HTML 响应（注入页面 chrome 并覆盖 `Cache-Control`），别依赖 HTML 的字节长度或 ETag。

## 目录速查

- `packages/core` — 基座：runtime 探测 / HEALTHZ_PATH / defineConfig / env-file（配置文件投递）/ logger / TtlKv
- `packages/db` — Drizzle 双 driver 工厂（sqlite 内置、pg 走 `./pg` 子路径注册）、双方言配方与 parity、迁移双轨、supabase Supavisor 直连（**仅自托管**）、**PostgREST 层**（`createRestDb` / `restSchemaFromPg` 派生 / `createRestTtlKv`，qw-pages 唯一数据路径）
- `packages/storage` — 四后端对象存储（local/s3/supabase/**db**）+ /files 代理路由（`./db`、`./tables`、`./chunk-client` 子路径）；⚠ local/s3/supabase 在 qw-pages 上均不可用，**db 后端是 Pages 唯一可用的 storage**（二进制 base64 存 `homura_files` 表），见支持矩阵
- `packages/auth` — 多凭证身份：OAuth2 客户端 + TextPassword（scrypt）+ WebAuthn（optional peer）+ 自管 session（`./hono`、`./tables`、`./webauthn` 子路径）；Identity Resolver 桥接 IdP → local user；所有 store 有 drizzle 与 PostgREST 两版。见 ADR-022/023
- `packages/3p` — 第三方平台能力分片抽象 + 钉钉实现（`./dingtalk` 子路径）
- `packages/license` — 激活心跳客户端（Ed25519 验签 + 本地到期判定）+ 四档处置守卫 + `requireFeature` 功能范围闸门（`./contract` 契约、`./hono` 守卫）；state store 有 drizzle 与 PostgREST 两版
- `packages/app-kit` — createApp 渐进式装配 + RuntimeAdapter（`./serve`、`./qw-pages`；两形态都自监听端口，差异只在缺省值）
- `templates/hono-react` — 全栈模板（活文档：每能力都有使用示范 + 部署 runbook）
- `scripts/` — 发包门禁（CI 与本地共用）：`check-package-exports.mjs`（exports ↔ tsdown entry ↔ dist 产物三重一致性）
- `docs/` — PRD / ARCHITECTURE / DECISIONS / specs / heritage
