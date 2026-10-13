# AGENTS.md

homura：Hono+React 全栈 template/SDK monorepo。派生 App 的能力都来自 `packages/*`，组装方式看 `templates/hono-react`（活文档）。

## 概述

- 本项目是什么：AI 开发的轻应用基础能力 SDK + 起步模板，App 双形态部署（standalone / qw-pages）

## 边界与范围

- 范围内：渐进式能力包（core/db/storage/auth/3p/license/app-kit）、模板、契约文档
- 非目标：多租户平台、低代码、可视化编辑器、CPaaS、OAuth 服务端（归 ../oauth2-dingtalk）、中央授权服务（归 ../homura-genuine）

## Agent 操作指南

- 如何理解本项目：先读 docs/ARCHITECTURE.md（包依赖图与装配链），再读 templates/hono-react 内目标能力的使用示范

- 全局规则 / 约定：
  - **渐进式耦合是最高设计原则**：任何能力包不得硬依赖其他能力包（app-kit 只依赖 hono+core）；可选依赖走 peer + 动态 import + 子路径导出
  - 依赖方向：core ← 其余包；auth/license 可依赖 @homurajs/db 的 schema-helpers；禁止反向依赖
  - **契约文件不许随手改**：`auth/src/types.ts`（OAuth2 上游）、`3p/src/index.ts`（平台能力契约）、`license/src/contract.ts`（genuine 契约）——修改需同步对应外部 repo 并过快照测试
  - drizzle-orm / drizzle-kit 版本精确锁 `1.0.0-rc.4`（根 pnpm.overrides 强制），drizzle import 尽量收敛在 @homurajs/db
  - TS strict 全开（含 noUncheckedIndexedAccess）；测试与实现同文件 colocate（`*.test.ts`）
  - 新导出必有测试；外呼类构造函数一律收 `fetchImpl` 注入口，测试不 mock 全局 fetch
  - 双方言 schema：App 写 colocated `schema/pg.ts` + `schema/sqlite.ts`，用 `pgCol/sqliteCol` 配方，parity 测试锁一致
  - 文档全 UTF-8 简体中文；git commit 遵循 Conventional Commits（type/scope 英文、描述简体中文、subject ≤72 字符）
  - 旧 Suzuran 已归档：`git show archive/suzuran-final:<path>` 考古，勿恢复旧代码

## 目录速查

- `packages/core` — 基座：runtime 探测 / defineConfig / logger / TtlKv
- `packages/db` — Drizzle 双 driver 工厂、双方言配方、迁移双轨、supabase 直连（`./pg` 子路径注册）
- `packages/storage` — 三后端对象存储（local/s3/supabase）+ /files 代理路由
- `packages/auth` — 通用 OAuth2 客户端 + 自管 session（`./hono`、`./tables` 子路径）
- `packages/3p` — 第三方平台能力分片抽象 + 钉钉实现（`./dingtalk` 子路径）
- `packages/license` — 激活心跳客户端 + 停服守卫（`./contract` 契约、`./hono` 守卫）
- `packages/app-kit` — createApp 渐进式装配 + RuntimeAdapter（`./serve`、`./qw-pages`）
- `templates/hono-react` — 全栈模板（活文档：每能力都有使用示范）
- `docs/` — PRD / ARCHITECTURE / DECISIONS / specs / heritage
