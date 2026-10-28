# AGENTS.md

homura：Hono+React 全栈 template/SDK monorepo。派生 App 的能力都来自 `packages/*`，组装方式看 `templates/hono-react`（活文档）。

## 概述

- 本项目是什么：AI 开发的轻应用基础能力 SDK + 起步模板，App standalone 部署（Node 单机 / 反代后）

## 边界与范围

- 范围内：渐进式能力包（core/db/storage/auth/3p/license/app-kit）、模板、契约文档
- 非目标：多租户平台、低代码、可视化编辑器、CPaaS、OAuth 服务端（归 ../oauth2-dingtalk）、中央授权服务（归 ../homura-genuine）

## Agent 操作指南

- 如何理解本项目：先读本文件的「能力清单」，再读 docs/ARCHITECTURE.md（包依赖图与装配链），然后读 templates/hono-react 内目标能力的使用示范

- 全局规则 / 约定：
  - **渐进式耦合是最高设计原则**：任何能力包不得硬依赖其他能力包（app-kit 只依赖 hono+core）；可选依赖走 peer + 动态 import + 子路径导出
  - 依赖方向：core ← 其余包；auth/license 可依赖 @homurajs/db 的 schema-helpers；禁止反向依赖
  - **契约文件不许随手改**：`auth/src/types.ts`（OAuth2 上游）、`3p/src/index.ts`（平台能力契约）、`license/src/contract.ts`（genuine 契约）——修改需同步对应外部 repo 并过快照测试。其中 `license/src/contract.ts` 与 `../homura-genuine/src/contract.ts` 必须**逐字一致**（含 `canonicalize` / `normalizePem` / `verifyEntitlement`：它们决定签名字节与 keyId，不一致等于验签静默失效），genuine 侧的 `contract-parity.test.ts` 会报出首个不同行号；同步方式是 `cp` 覆盖，**不要手工合并**
  - drizzle-orm / drizzle-kit 版本精确锁 `1.0.0-rc.4`（根 pnpm.overrides 强制），drizzle import 尽量收敛在 @homurajs/db
  - TS strict 全开（含 noUncheckedIndexedAccess）；测试与实现同文件 colocate（`*.test.ts`）
  - 新导出必有测试；外呼类构造函数一律收 `fetchImpl` 注入口，测试不 mock 全局 fetch
  - **schema 双方言同源**：App 写 colocated `schema/pg.ts` + `schema/sqlite.ts`（`pgCol/sqliteCol` 配方 + `assertSchemaParity` 门禁），迁移 SQL 由 drizzle-kit 生成、绝不手写 DDL
  - **数据方言二选一，别在 App 里硬编码**：`sqlite`（单机缺省）/ `pg`（自建 pgsql 或自托管 supabase 直连）。模板经 `DIALECT` env 切换
  - **常量单点定义**：健康检查路径走 core 的 `HEALTHZ_PATH`（`/healthz`）——app-kit 注册路由与 license guard 豁免清单同源读取，改一处必须同步
  - **密钥可走随产物携带的 `config/homura.config.env`**；真实 env 优先于文件；`SESSION_SECRET` 沿用仓库公开缺省值时，`NODE_ENV=production` **启动即拒绝**
  - **版本号只改根 `package.json` 一处**（唯一权威，ADR-024）：子包 version 是派生产物，改完跑 `node scripts/sync-version.mjs` 同步到 `packages/*`；**不要手工编辑子包 version**（CI 会拦下漂移）。子包仍需保留 version 字段——pnpm publish 硬性要求，删了会 `ERR_PNPM_PACKAGE_VERSION_NOT_FOUND`
  - **`package.json` 的 exports 必须与 `tsdown.config.ts` 的 entry 一一对应**：漏了 entry，构建照样"成功"但 dist 少文件，而开发态 exports 指向 `./src/*.ts` 直连源码，本地测试与 CI 全绿，只有 npm 发布产物是坏的（消费方 import 即 `ERR_MODULE_NOT_FOUND`）。一致性由 `scripts/check-package-exports.mjs` 双重门禁把守（test.yml 静态校验 + release.yml 产物校验）。历史上 `@homurajs/storage` 漏发过 `./db`/`./tables`/`./chunk-client`，等于文件存储整个不可用（后端已删除，教训保留）
  - 文档全 UTF-8 简体中文；git commit 遵循 Conventional Commits（type/scope 英文、描述简体中文、subject ≤72 字符）
  - 旧 Suzuran 已归档：`git show archive/suzuran-final:<path>` 考古，勿恢复旧代码

## 能力清单（写代码前先看这张表）

| 能力                                   | 状态     | 说明                                                                                                                                           |
| -------------------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| core（配置/日志/TtlKv/env-file/healthz） | ✅      | defineConfig 类型化配置 + 随产物 env 文件 + JSON-lines logger                                                                                   |
| app-kit（装配/监听/静态/SPA fallback） | ✅       | createApp 固定中间件链 + RuntimeAdapter（`./serve`，@hono/node-server）                                                                          |
| db · `sqlite`                          | ✅       | node:sqlite，单机缺省                                                                                                                            |
| db · `pg` 直连                         | ✅       | 自建 pgsql / 自托管 supabase（Supavisor 直连，`./pg` 子路径动态注册 driver）                                                                     |
| auth（登录链）                         | ✅       | 多凭证身份模型（ADR-022）：TextPassword（1:1）+ WebAuthn（1:N）+ OAuth2 identity links（1:N）。OAuth2 路径 `/auth/oauth2/*`。PasswordProvider 用 Node 内置 scrypt（零依赖，ADR-023）。WebAuthn 走 `@simplewebauthn/server` optional peer + `./webauthn` 子路径。Identity Resolver JIT 默认开启。session sub = local user ID（Breaking） |
| license（到期 / 停服 / 功能范围）      | ✅       | standalone 八阶段生命周期实测通过（真 genuine 进程）。前置：genuine 必须 https 公网可达                                                           |
| 3p（钉钉消息/审批/通讯录/应用发现）    | ✅       | 2026-10-23 真实凭证 live 集成验证（api.live.test.ts）：gettoken/工作通知 asyncsend_v2+回执/通讯录 v2（user·department 增删查）/microApp 发现/手机号反查全部打通。⚠ 修订前旧实现的 contacts 三端点全部 InvalidAction.NotFound、message 因只传 x-acs 头（topapi 须 `?access_token=` 查询参数）发不出——桩测试按 URL 子串匹配给了假绿灯，故新增 live 测试兜底。审批端点存在但需 Workflow.* 权限；家校通讯录需 qyapi_addresslist_edu_read，无权限时降级不抛错 |
| storage · `local`                      | ✅       | 默认 `./data/files`，图床/打卡照片等场景                                                                                                         |
| storage · `supabase`                   | ✅       | 零 SDK 手写 REST；bucket 必须预先存在（anon 无建桶权）                                                                                            |
| storage · `s3`                         | ✅ 已实测 | 需 App 自行安装两个 optional peer（`@aws-sdk/client-s3`、`s3-request-presigner`，模板已列 devDep）。真阿里云 OSS 实测：整文件上传/列举/代理下载逐字节一致。⚠ **OSS 必须 `S3_FORCE_PATH_STYLE=false`**（virtual-hosted） |
| storage · `s3` 预签名直传              | ✅ 已实测 | `getSignedUploadUrl`（预签名 PUT）+ `/api/files/presign`：浏览器直传 OSS/S3，字节不过 App/网关 → 大文件正解。真阿里云 OSS 实测通过（3MB PUT 200、回读一致）。⚠ OSS 必须 `S3_FORCE_PATH_STYLE=false`；浏览器直传需桶配 CORS |

图例：✅ 已验证可用 · ⚠️ 有前置条件

## 目录速查

- `packages/core` — 基座：HEALTHZ_PATH / defineConfig / env-file（配置文件投递）/ logger / TtlKv
- `packages/db` — Drizzle 双 driver 工厂（sqlite 内置、pg 走 `./pg` 子路径注册）、双方言配方与 parity、迁移双轨、supabase Supavisor 直连（**仅自托管**）
- `packages/storage` — 三后端对象存储（local/s3/supabase）+ /files 代理路由（`./proxy` 子路径）
- `packages/auth` — 多凭证身份：OAuth2 客户端 + TextPassword（scrypt）+ WebAuthn（optional peer）+ 自管 session（`./hono`、`./tables`、`./webauthn` 子路径）；Identity Resolver 桥接 IdP → local user。见 ADR-022/023
- `packages/3p` — 第三方平台能力分片抽象 + 钉钉实现（`./dingtalk` 子路径）
- `packages/license` — 激活心跳客户端（Ed25519 验签 + 本地到期判定）+ 四档处置守卫 + `requireFeature` 功能范围闸门（`./contract` 契约、`./hono` 守卫）
- `packages/app-kit` — createApp 渐进式装配 + RuntimeAdapter（`./serve`）
- `templates/hono-react` — 全栈模板（活文档：每能力都有使用示范）
- `scripts/` — 发包门禁（CI 与本地共用）：`sync-version.mjs`（根版本 → 子包单向同步，`--check` 做漂移门禁）、`check-package-exports.mjs`（exports ↔ tsdown entry ↔ dist 产物三重一致性）
- `docs/` — PRD / ARCHITECTURE / DECISIONS / specs / heritage
