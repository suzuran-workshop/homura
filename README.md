# homura

Hono + React 全栈 Node 应用的 template / SDK monorepo：AI 开发、双形态部署（独立 Node 服务 / qw-pages 托管）。

## 这是什么？

- 定位：为一系列由 AI 开发的 Hono+React 全栈轻应用提供**渐进式**基础能力（持久层、认证、第三方平台、对象存储、激活控制）与起步模板
- 解决的核心问题：每个 App 重复造轮子（钉钉登录、图床、DB 适配、远程停服）→ homura 一次沉淀、逐级复用

## 为什么存在？

- 背景：Suzuran Cloud（多租户 PaaS）验证失败后，方向转为「AI 直接开发独立轻应用」；qw-pages（千问办公托管）允许上传 Node dist 运行，但缺统一的登录对接与基础能力层
- 动机：App 既可独立部署（node:sqlite / pgsql），也可上传 qw-pages（supabase）——一套代码双形态，基础能力按需渐进耦合

## 如何安装和运行？

- 前置要求：Node.js >= 22.5（独立 sqlite 形态以 24 为准）、pnpm >= 10
- 安装步骤：

```bash
pnpm install
```

- 常用命令：

```bash
pnpm typecheck        # 全包类型检查
pnpm test             # 全包测试（vitest workspace）
pnpm format           # prettier
cd templates/hono-react && pnpm dev   # 模板开发（轮二完善）
```

## 当前状态

- 阶段：开发中（轮一地基完成：core / db / storage / license；轮二能力建设中：auth / 3p / app-kit / 模板）
- 已知限制：
  - drizzle-orm 1.0.0-rc.4 精确锁版（node:sqlite driver 仅 1.0 线存在），升级需独立 PR 过 parity 测试
  - qw-pages 入口约定未知（Node 版本/导出形态/静态服务方），已用 RuntimeAdapter + 三导出 + manifest 对冲，见 docs/specs/000-qw-pages-deployment.md
  - 钉钉 webhook 回调本轮不做（未来为 @homura/3p 的 webhook capability）

## 核心技术

- TypeScript 5.9 (strict) + pnpm workspace + vitest
- Hono 4 / React 19 / Vite 7（模板）
- Drizzle ORM 1.0.0-rc.4（postgres-js + node:sqlite 双 driver、双方言 schema、迁移双轨）
- jose（session JWT）/ 手写 REST（supabase storage）/ 动态 import（AWS SDK，可选）

详细架构见 docs/ARCHITECTURE.md，决策记录见 docs/DECISIONS.md。
