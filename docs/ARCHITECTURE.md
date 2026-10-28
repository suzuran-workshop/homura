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
           Node 独立进程（部署目标）· 钉钉开放平台
```

## 核心模块

| 模块                 | 职责                                                                                                                                                                                                                                                                                                       |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| @homurajs/core       | detectRuntime（HOMURA_RUNTIME 显式优先 + 实测注入标记启发式）、HEALTHZ_PATH/healthzPathFor（形态相关路径的同源常量）、defineConfig（配置即文档）、env-file（部署期配置文件并入 env：Pages 无 env 注入口时的密钥投递通道，ADR-019）、logger（JSON lines + redact）、TtlKv（一次性消费语义）                 |
| @homurajs/db         | driver 注册制 createDb（sqlite 内置 / `import '@homurajs/db/pg'` 注册 pg）、双方言配方（pgCol/sqliteCol）、assertSchemaParity、runMigrations（rc.4 子目录格式）、supabase Supavisor 直连构造（**仅自托管**） |
| @homurajs/storage    | FileStorage 六方法契约（ns 前缀隔离/代理 URL/presign 降级）+ local / s3(动态 import) / supabase(手写 REST) 三实现 + /files 代理路由                                                                                                                                                                        |
| @homurajs/auth       | OAuth2Client（code flow，state TTL-KV 一次性消费）+ SessionManager（HS256 短 JWT + opaque refresh rotate + familyId 复用检测族吊销）+ hono 路由/中间件                                                                                                                                                     |
| @homurajs/3p         | Capability 分片（oauth/message/approval/contacts）+ supports 守卫协商 + dingtalk 实现（CorpTokenManager 缓存+single-flight、三组 v1.0 API、OAuth 预设）                                                                                                                                                    |
| @homurajs/license    | genuine 契约（contract.ts 与 ../homura-genuine 逐字同步，parity 测试守）+ LicenseClient（register/心跳±抖动/宽限状态机/**Ed25519 验签**/本地到期判定）+ licenseGuard（四档 enforcement/提醒头/fail-open）+ requireFeature（功能范围闸门）+ drizzle state store                       |
| @homurajs/app-kit    | createApp 固定中间件链装配（健康检查路径走 core HEALTHZ_PATH）+ RuntimeAdapter（`./serve`，@hono/node-server 端口监听）                                                                                                                                           |
| templates/hono-react | 渐进式装配示范（env.ts 定义每能力独立 env 开关 + DIALECT 定数据方言 + app.ts buildApp 逐级注入）+ build（vite 前端 + tsdown 后端 bundle，代码分割成多 chunk，非单文件）                                                                       |

## 模块关系

- 依赖方向：core ← 全部；auth/license → @homurajs/db（仅 schema-helpers 子路径）；app-kit → (hono, core)；3p 与 auth 之间**零 import**（OAuthPreset 结构化契约鸭子类型互操作）

## 数据流

- 登录（OAuth2）：浏览器 → /auth/oauth2/authorize（state 入 TtlKv）→ oauth2-dingtalk /:orgId/authorize → 钉钉 → /auth/oauth2/callback → code+state → token 端点 → userinfo → mapUser → identityResolver.resolve（IdP sub → local user，JIT 建户或拒绝）→ SessionManager 签发双 cookie（HttpOnly，sub = local user.id）。密码登录走 /auth/password/*，WebAuthn 走 /auth/webauthn/*（见对应 spec）
- 刷新：sessionMiddleware 检出 access 过期 → refresh cookie → store.consume（一次性）→ rotate 签新；复用检出 → revokeFamily
- 上传：App → storage.uploadFile(ns,...) → 后端落对象（key=ns/files/ts_name）→ 返回代理 URL `/files/<key>`；下载走 createFileProxyRoutes
- 激活：App 启动 → license.register（instanceKey 持久化；**失败不退出**，warn 后置 unknown 靠心跳重试）→ startHeartbeat（server 下发间隔±10%）→ 每次响应携带 **Ed25519 签名的授权载荷**（status/expiresAt/enforcement/features/notice）→ App 验签后才采信 → guard 按 enforcement 分档处置（none/notice/core/all）+ requireFeature 逐点校验功能范围
- 部署：`pnpm build`（vite 前端 + tsdown 后端 bundle；产物含 dist/server/index.mjs + dist/client；可选拷入 config/homura.config.env）

## 外部系统

- ../oauth2-dingtalk（已上线 dingtalk.auth.xrl.im）：/:orgId/authorize|token|userinfo；仅 code flow 无 refresh（故 session 自管）
- ../homura-genuine（**已实现**，Hono + node:sqlite + Ed25519）：`/v1/register`、`/v1/heartbeat`、`/v1/keys` + 管理端点（bearer token，签发/调期限/改处置强度/改功能范围/停服/轮换密钥）；契约 = license/src/contract.ts（两侧逐字一致，genuine 侧有 parity 测试）；2026-10-14 已双端真进程联调八阶段
- Node 独立进程：`node dist/server/index.mjs` 常驻 + 反代到 PORT/HOST；密钥可用随产物携带的 config/homura.config.env 投递
- 钉钉开放平台：oapi gettoken（企业 token 7200s）+ v1.0 API（x-acs-dingtalk-access-token 头）

## 重要技术边界

- drizzle-orm 1.0.0-rc.4 精确锁版；import 收敛 @homurajs/db；升级独立 PR 必跑 parity + 迁移往返
- 内部包 exports 直指 src/index.ts（不预编译）；v1 派生式消费不发 npm
- 部署差异收敛在 RuntimeAdapter（`./serve`），业务代码零 if-else；adapter 只承载真实差异（端口/HOST/静态目录缺省值）
- 形态相关的路径常量（健康检查）由 core 的 `HEALTHZ_PATH` 单点定义，app-kit 注册与 license guard 豁免清单同源读取，避免两处漂移
- 数据方言二选一：`sqlite`（单机缺省）/ `pg`（自建 pgsql 或自托管 supabase 直连）。schema 双方言手写 + parity 门禁
