# homura

Hono + React 全栈 Node 应用的 template / SDK monorepo：AI 开发、standalone 部署（独立 Node 服务）。

## 这是什么？

- 定位：为一系列由 AI 开发的 Hono+React 全栈轻应用提供**渐进式**基础能力（持久层、认证、第三方平台、对象存储、激活控制）与起步模板
- 解决的核心问题：每个 App 重复造轮子（钉钉登录、图床、DB 适配、远程停服）→ homura 一次沉淀、逐级复用

## 为什么存在？

- 背景：Suzuran Cloud（多租户 PaaS）验证失败后，方向转为「AI 直接开发独立轻应用」
- 动机：App 独立部署（node:sqlite / pgsql），基础能力按需渐进耦合

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

- 阶段：MVP 完成（7 能力包 + 全栈模板全部实现，测试全绿，typecheck 全过；standalone 部署形态）
  - 能力包：core / db / storage / auth / 3p（钉钉）/ license / app-kit
  - 模板 templates/hono-react：渐进式装配 + 双方言迁移 + 双形态 build + e2e 冒烟

- 已知限制：
  - drizzle-orm 1.0.0-rc.4 精确锁版（node:sqlite driver 仅 1.0 线存在），升级需独立 PR 过 parity 测试
  - **license 已实测**：standalone 八阶段生命周期（到期/续期/四档处置/功能范围/停服）通过。前置：genuine 必须 https 公网可达
  - **前端强提醒 UI 已实现**：`templates/hono-react/src/client/LicenseBanner.tsx` 轮询 `/_license`，只要 `notice` 非空就展示且不可关闭（产品硬要求"每次使用强提醒、无差别提示所有用户"）；`requireFeature` 示范路由 `license-demo.ts` 已给三条端点（`/status` 无闸门、`/export` 需 `export`、`/beta/ping` 需 `beta`），含 colocated 测试穷尽分支
  - **`SESSION_SECRET` 缺省值是仓库里的公开字符串**：`NODE_ENV=production` 下沿用缺省值会**启动即拒绝**（HS256 密钥公开 = 会话可伪造）。部署前必须在 `config/homura.config.env` 或真实环境变量里给 >=32B 随机值
    - 钉钉 webhook 回调本轮不做（未来为 @homurajs/3p 的 webhook capability）
  - pg 侧迁移往返、s3 真实 minio 集成测试待 CI services 覆盖（本地 sqlite + 桩已验证）
  - 中央授权服务 `../homura-genuine` 已实现（Hono + node:sqlite + Ed25519）：许可证签发、到期随时可调、四档处置强度、签名功能范围、密钥轮换

## 核心技术

- TypeScript 5.9 (strict) + pnpm workspace + vitest
- Hono 4 / React 19 / Vite 7（模板）
- Drizzle ORM 1.0.0-rc.4（postgres-js + node:sqlite 双 driver、双方言 schema、迁移双轨）
- jose（session JWT）/ 手写 REST（supabase storage）/ 动态 import（AWS SDK，可选）

详细架构见 docs/ARCHITECTURE.md，决策记录见 docs/DECISIONS.md。
