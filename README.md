# homura

Hono + React 全栈 Node 应用的 template / SDK monorepo：AI 开发、双形态部署（独立 Node 服务 / qw-pages 托管）。

## 这是什么？

- 定位：为一系列由 AI 开发的 Hono+React 全栈轻应用提供**渐进式**基础能力（持久层、认证、第三方平台、对象存储、激活控制）与起步模板
- 解决的核心问题：每个 App 重复造轮子（钉钉登录、图床、DB 适配、远程停服）→ homura 一次沉淀、逐级复用

## 为什么存在？

- 背景：Suzuran Cloud（多租户 PaaS）验证失败后，方向转为「AI 直接开发独立轻应用」；qw-pages（千问办公托管）以常驻 Node 进程方式运行上传的 dist，但缺统一的登录对接与基础能力层
- 动机：App 既可独立部署（node:sqlite / pgsql），也可上传 qw-pages（PostgREST）——一套代码双形态，基础能力按需渐进耦合

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

- 阶段：MVP 完成（7 能力包 + 全栈模板全部实现，264 测试全绿，typecheck 8/8；双形态 build 实测通过，qw-pages 真实产物已线上端到端验证，含登录跳转与密钥投递）
  - 能力包：core / db / storage / auth / 3p（钉钉）/ license / app-kit
  - 模板 templates/hono-react：渐进式装配 + 双方言迁移 + 双形态 build + e2e 冒烟
  - qw-pages 平台约定已全部实测确认（2026-10-13 线上探针），定论见 docs/specs/module-qw-pages.md
- 已知限制：
  - drizzle-orm 1.0.0-rc.4 精确锁版（node:sqlite driver 仅 1.0 线存在），升级需独立 PR 过 parity 测试
  - **qw-pages 形态的数据层只有 PostgREST 一条路**（`DIALECT=rest`）：应用根目录只读、唯一可写区跨发布清空 → sqlite 不可用；平台不下发 PG 凭据且 5432 出网被禁 → pg 直连不可用。表与 RLS policy 须在部署期用平台受控迁移建（App 无 DDL 权限），四张表的配方见 spec
  - **qw-pages 形态的登录链机制已打通，待真实 IdP 联调**：`createRestSessionStore` / `createRestStateStore` 已实现；密钥投递走随产物携带的 `homura.config.env`（实测产物不可公网读取，见 spec）；`/auth/login` 已在线上返回 302。剩余：`/auth/callback` 全链路需真实钉钉 IdP，license 需 ../homura-genuine 上线
  - **`SESSION_SECRET` 缺省值是仓库里的公开字符串**：qw-pages 形态或 `NODE_ENV=production` 下沿用缺省值会**启动即拒绝**（HS256 密钥公开 = 会话可伪造）。部署前必须在 `config/homura.config.env` 里给 >=32B 随机值
  - **qw-pages 形态暂不支持对象存储**：anon 无建桶权（RLS 403），受控迁移角色对 `storage` schema 也无权（42501）→ 桶建不出来，PRD 的"图床刚需"在该形态待平台侧预置桶
  - 钉钉 webhook 回调本轮不做（未来为 @homurajs/3p 的 webhook capability）
  - pg 侧迁移往返、s3 真实 minio 集成测试待 CI services 覆盖（本地 sqlite + 桩已验证）
  - 中央授权服务 ../homura-genuine 未建，license 契约先行（contract.ts 为需求输入）

## 核心技术

- TypeScript 5.9 (strict) + pnpm workspace + vitest
- Hono 4 / React 19 / Vite 7（模板）
- Drizzle ORM 1.0.0-rc.4（postgres-js + node:sqlite 双 driver、双方言 schema、迁移双轨）
- PostgREST 手写客户端（零依赖，qw-pages 数据层 + session/license store；表描述符从 pg schema 派生）
- jose（session JWT）/ 手写 REST（supabase storage）/ 动态 import（AWS SDK，可选）

详细架构见 docs/ARCHITECTURE.md，决策记录见 docs/DECISIONS.md。
