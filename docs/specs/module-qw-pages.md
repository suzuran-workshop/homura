# Spec — qw-pages 部署约定（待确认清单）

## 要构建什么
- 目标：qw-pages 上传 dist 的产物契约与适配点，未知约定全部单点收口

## 待确认清单（每项标注适配点）

| # | 未知项 | 适配点文件 | 确认后动作 |
|---|--------|-----------|-----------|
| 1 | Node 运行时版本 | templates/hono-react/package.json engines | 版本低于 22.5 时：qw-pages 形态禁 node:sqlite（本就推荐 supabase），bundle target 调整 |
| 2 | 入口导出约定（default / fetch / app / 其他） | src/server/qw-pages.ts（三导出对冲） | 保留命中的导出，删除其余 |
| 3 | 是否执行 npm install | scripts/build.mjs（自包含单文件 bundle） | 若装依赖：可去掉 noExternal 全量打包，减体积 |
| 4 | 静态资源服务方（平台托管 or App 自理） | app-kit qw-pages adapter（app 内 serveStatic，import.meta.url 定位） | 平台托管：删 app 内静态，manifest.assets 指路 |
| 5 | 环境变量注入方式 | core detectRuntime 的 QW_PAGES_ENV_MARKERS | 确认真实标记名，收敛常量数组 |
| 6 | 实例数（单实例 or 多实例） | auth state KV 选型（内存 vs createDbTtlKv） | 多实例：模板默认切 DB KV |
| 7 | dist 打包格式（zip / 目录 / tar） | scripts/build.mjs 产物段 | 按需加压缩步骤 |
| 8 | 出网白名单（Supavisor 443 是否放行） | db/pg supabase.ts（PG 直连） | 若仅 HTTPS：降级方案另议（PostgREST 适配层） |

## 约束
- 任何确认只改上表适配点文件，不散落到能力包

## 本轮 build 实现结论（scripts/build.mjs，双形态已实测）
- **standalone**：tsdown entry=index.ts，`noExternal: [/^@homurajs\//]`——只打包 workspace 源码包，
  第三方（drizzle/hono/postgres）走运行时 node_modules；产物 `node dist/server/index.mjs` 真实进程验证通过
- **qw-pages**：tsdown entry=qw-pages.ts，`noExternal: [/.*/]`——全打包成自包含单文件，
  外部 import 仅剩 `node:` 内置（实测确认）；exportHandlers 三导出（default/fetch/app）对冲入口约定；
  产物 + homura.manifest.json；直接 import 产物调 fetch handler 验证通过
- ⚠ **`@homurajs/*` 两个形态都必须打包**：它们是源码直出包（exports→src/*.ts），
  external 化后运行时会去 import `.ts` 直接崩——这是 build 的头号陷阱
- ⚠ tsdown 须 `config: false`：否则误读 vite/vitest.config 触发 `define` 无效选项警告
- tsdown ESM 产出 `index.js`，build 脚本统一 rename 为 `index.mjs`（上传后无 package.json type 上下文也安全）

## 验收标准
- [x] 双形态 build 产物结构实测（standalone 进程 + qw-pages fetch handler）
- [x] qw-pages 自包含验证（外部 import 仅剩 node: 内置）+ manifest 产出
- [ ] 逐项确认真实 qw-pages 约定后更新待确认清单（Node 版本/入口/装依赖/静态/env/实例数/打包格式/出网）
- [ ] homura.manifest.json 字段与 qw-pages 实际解析一致
