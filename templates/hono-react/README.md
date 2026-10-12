# template-hono-react

homura 全栈模板：Hono + React + Vite，**AI 开发的起点与活文档**——每个能力包在这里都有使用示范。

## 渐进式装配（homura.config.ts）

每能力独立 env 开关，从零能力到全家桶逐级启用：

| 层级 | 开关 | 解锁 |
|------|------|------|
| 0 | 无 | 纯 routes + /healthz + 静态 SPA |
| 1 | `DIALECT=sqlite\|pg` | db + 双方言 schema + 迁移 |
| 2 | `OAUTH2_*` | 钉钉登录（oauth2-dingtalk）+ session |
| 3 | `DINGTALK_*` | 平台消息/审批/通讯录（3p 能力协商） |
| 4 | `STORAGE_BACKEND=local\|s3\|supabase` | 图床/文件 |
| 5 | `GENUINE_SERVER` | 激活心跳 + 停服守卫 |

## 双形态

```bash
pnpm build            # standalone：dist/client + dist/server/index.mjs（node 运行）
pnpm build:qw-pages   # qw-pages：自包含单文件 + homura.manifest.json（上传）
```

## 开发

```bash
pnpm dev          # Vite（/api /auth /files 代理到 :3000，零 CORS）
pnpm dev:server   # tsx watch 服务端
pnpm db:generate  # 双方言迁移生成（drizzle/pg + drizzle/sqlite）
pnpm test         # 含 parity 与 e2e 冒烟
```

（轮二 2.4 步填充完整实现——当前为骨架。）
