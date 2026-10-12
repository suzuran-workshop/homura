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

## 验收标准
- [ ] 逐项确认后更新本表（状态：已确认 + 结论）
- [ ] homura.manifest.json 字段与 qw-pages 实际解析一致
