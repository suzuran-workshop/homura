# template-hono-react

homura 全栈模板：Hono + React + Vite，**AI 开发的起点与活文档**——每个能力包在这里都有使用示范。

## 渐进式装配

装配核心是 `src/server/app.ts` 的 `buildApp(config, overrides)`：从 `src/server/env.ts`
的 `configSpecs`（defineConfig）读出「启用了哪些能力」，逐级注入 `createApp`。
每能力一组独立 env，缺省则不启用——从零能力到全家桶：

| 层级 | 开关 env | 解锁 | 装配文件 |
|------|---------|------|---------|
| 0 | 无 | 纯 routes + /healthz + 静态 SPA | app.ts |
| 1 | `DIALECT=sqlite\|pg` | db + 双方言 schema + 迁移 | db.ts / schema/ |
| 2 | `OAUTH_DINGTALK_ORG_ID` | 钉钉登录（oauth2-dingtalk）+ session | app.ts buildAuth |
| 3 | `DINGTALK_APP_KEY`+`_SECRET` | 平台消息/审批/通讯录（3p 能力协商） | routes/platform.ts |
| 4 | `STORAGE_BACKEND=local\|s3\|supabase` | 图床/文件 | routes/files.ts |
| 5 | `GENUINE_SERVER` | 激活心跳 + 停服守卫 | app.ts buildLicense |

全部 env 见 `.env.example`（由 `pnpm gen:env` 从 configSpecs 生成——配置即文档）。

## 双形态

```bash
pnpm build            # standalone：dist/client + dist/server/index.mjs（node 运行）
pnpm build:qw-pages   # qw-pages：自包含单文件 + homura.manifest.json（上传）
```

两形态 99% 共用（同一 buildApp），差异仅入口（index.ts / qw-pages.ts）与打包策略
（standalone 外部化第三方、qw-pages 全打包）。⚠ `@homura/*` 源码直出，两形态都必须打进 bundle。
详见 docs/specs/module-qw-pages.md。

## 开发

```bash
pnpm dev          # Vite 前端（/api /auth /files 代理到 :3000，零 CORS）
pnpm dev:server   # tsx watch 服务端（另开终端，:3000）
pnpm db:generate  # 双方言迁移生成（drizzle/pg + drizzle/sqlite）
pnpm gen:env      # 从 configSpecs 重新生成 .env.example
pnpm test         # parity（schema 双方言一致）+ e2e 冒烟（全链路 app.request）
```

## 派生新 App

复制本模板 → 改 `src/server/schema/{pg,sqlite}.ts` 业务表 → `pnpm db:generate` →
在 `routes/` 加业务路由 → 按需增删 env 开关。契约文件（auth/3p/license）勿改。
