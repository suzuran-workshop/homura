# ARCHITECTURE — homura

## 系统概述

- 整体结构：

```
                    ┌──────────────────────────────────────┐
                    │        templates/hono-react          │
                    │  （派生 App：组装一切，活文档）        │
                    └───────┬──────────────────────────────┘
                            │ workspace:* 引用
   ┌──────────┬─────────┬───┴────┬─────────┬──────────┬──────────┐
   │ core     │ db      │ auth   │ storage │ 3p       │ license  │
   │ 探测/配置 │ Drizzle │ OAuth2 │ 三后端  │ 平台能力  │ 心跳守卫  │
   │ 日志/KV  │ 双方言  │ session│ 对象存储│ 分片抽象  │ fail-open│
   └────┬─────┴────┬────┴───┬────┴────┬────┴────┬─────┴────┬─────┘
        │          │        │         │         │          │
        └── app-kit（createApp + RuntimeAdapter，仅依赖 hono+core）──┘

  外部系统：../oauth2-dingtalk（登录服务端）· ../homura-genuine（授权）·
           qw-pages / Node 独立进程（部署目标）· 钉钉开放平台
```

## 核心模块

| 模块 | 职责 |
|------|------|
| @homurajs/core | detectRuntime（HOMURA_RUNTIME 显式优先 + QW_PAGES 标记启发式）、defineConfig（配置即文档）、logger（JSON lines + redact）、TtlKv（一次性消费语义） |
| @homurajs/db | driver 注册制 createDb（sqlite 内置 / `import '@homurajs/db/pg'` 注册 pg）、双方言配方（pgCol/sqliteCol）、assertSchemaParity、runMigrations（rc.4 子目录格式）、supabase Supavisor 443 直连构造 |
| @homurajs/storage | FileStorage 六方法契约（ns 前缀隔离/代理 URL/presign 降级）+ local / s3(动态 import) / supabase(手写 REST) 三实现 + /files 代理路由 |
| @homurajs/auth | OAuth2Client（code flow，state TTL-KV 一次性消费）+ SessionManager（HS256 短 JWT + opaque refresh rotate + familyId 复用检测族吊销）+ hono 路由/中间件 |
| @homurajs/3p | Capability 分片（oauth/message/approval/contacts）+ supports 守卫协商 + dingtalk 实现（CorpTokenManager 缓存+single-flight、三组 v1.0 API、OAuth 预设） |
| @homurajs/license | genuine 契约（contract.ts 单一事实源）+ LicenseClient（register/心跳±抖动/宽限状态机）+ licenseGuard（503/警告头/fail-open） |
| @homurajs/app-kit | createApp 固定中间件链装配 + RuntimeAdapter（node: 监听+磁盘静态；qw-pages: 三导出对冲+app 内静态）+ /healthz |
| templates/hono-react | 渐进式装配示范（env.ts 定义每能力独立 env 开关 + app.ts buildApp 逐级注入）+ 双形态 build（standalone dist / qw-pages 自包含单文件 + manifest） |

## 模块关系

- 依赖方向：core ← 全部；auth/license → @homurajs/db（仅 schema-helpers 子路径）；app-kit → (hono, core)；3p 与 auth 之间**零 import**（OAuthPreset 结构化契约鸭子类型互操作）

## 数据流

- 登录：浏览器 → /auth/login（state 入 TtlKv）→ oauth2-dingtalk /:orgId/authorize → 钉钉 → callback → code+state → token 端点 → userinfo → mapUser → SessionManager 签发双 cookie（HttpOnly）
- 刷新：sessionMiddleware 检出 access 过期 → refresh cookie → store.consume（一次性）→ rotate 签新；复用检出 → revokeFamily
- 上传：App → storage.uploadFile(ns,...) → 后端落对象（key=ns/files/ts_name）→ 返回代理 URL `/files/<key>`；下载走 createFileProxyRoutes
- 激活：App 启动 → license.register（instanceKey 持久化）→ startHeartbeat（server 下发间隔±10%）→ genuine 下发 suspended → guard 503
- 部署：`pnpm build`（standalone：vite + tsdown index.ts）/ `pnpm build:qw-pages`（entry=qw-pages.ts 自包含单文件 + homura.manifest.json）

## 外部系统

- ../oauth2-dingtalk（已上线 dingtalk.auth.xrl.im）：/:orgId/authorize|token|userinfo；仅 code flow 无 refresh（故 session 自管）
- ../homura-genuine（待建）：/v1/register、/v1/heartbeat；契约 = license/src/contract.ts
- qw-pages：上传 dist 运行；允许 TCP 出网（Supavisor 443 PG 直连可行）；入口约定未知（specs/module-qw-pages 对冲）
- 钉钉开放平台：oapi gettoken（企业 token 7200s）+ v1.0 API（x-acs-dingtalk-access-token 头）

## 重要技术边界

- drizzle-orm 1.0.0-rc.4 精确锁版；import 收敛 @homurajs/db；升级独立 PR 必跑 parity + 迁移往返
- 内部包 exports 直指 src/index.ts（不预编译）；v1 派生式消费不发 npm
- qw-pages 全部未知约定收敛在 RuntimeAdapter + 模板 qw-pages.ts + manifest，业务代码零 if-else
