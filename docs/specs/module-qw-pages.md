# Spec — qw-pages 部署约定（已实测确认）

> 状态变更：2026-10-13 由「待确认清单」转为「实测定论」。
> 方法：把真实 npm 包 `@homurajs/app-kit` 装进最小发布目录，用受控发布工具部署到
> `36cl5mlu.qwenwork.host`，在**线上进程内**回读 `process.env`、双路计数归因请求来源、
> 探测出网与落盘，并跨发布回读数据。所有结论均可复现（探针入口见「复现方法」）。

## 要构建什么

- 目标：qw-pages 上传 dist 的产物契约与适配点，跨形态差异单点收口
- 现状：8 项约定全部确认，四重对冲中三重已退役（见 ADR-012 修订）

## 实测定论

| #   | 约定项               | 定论                                                                                                                                                                                                                                                                                           | 证据                                                                                                                                                                                              |
| --- | -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Node 运行时版本      | **v22.23.1**（两次部署一致）                                                                                                                                                                                                                                                                   | 进程内 `process.version`                                                                                                                                                                          |
| 2   | 入口导出约定         | **不存在 serverless 导出约定**；平台拉起 `node <entrypoint>` 常驻进程，注入 PORT/HOST 并把网关流量反代到该 socket                                                                                                                                                                              | 探针同时挂 `serve()` 与 `default/fetch/app` 三导出，全程 `serve` 命中 47 次、`handler` **0** 次                                                                                                   |
| 3   | 是否执行 npm install | **不装**；但发布目录里现成的 `node_modules` 会被原样打包，运行时可直接解析                                                                                                                                                                                                                     | 线上 import 解析到 `/opt/qwenwork-page/app/node_modules/@homurajs/app-kit/dist`                                                                                                                   |
| 4   | 静态资源服务方       | **App 自理**（平台不托管静态）；平台只对 HTML 响应做后处理：注入页面 chrome 脚本并覆盖 `Cache-Control`，非 HTML 资源原样透传自定义缓存头                                                                                                                                                       | `/assets/probe.css` 保留 App 设的 `immutable`；`/index.html` 的 `Cache-Control` 被改成 `private, no-cache, max-age=0, must-revalidate`，体积从 ~400B 变 14102B，头部多出 `var __mr='footer'` 脚本 |
| 5   | 环境变量注入方式     | 固定 **12 个**：`PORT` `HOST` `NODE_ENV` `HOME` `TMPDIR` `XDG_CACHE_HOME` `XDG_CONFIG_HOME` `XDG_DATA_HOME` `QWENWORK_WRITABLE_DIR` `SUPABASE_URL` `SUPABASE_ANON_KEY` `SUPABASE_INSTANCE_ID`。**无任何 `QW_PAGES*` 命名变量**，无 `DATABASE_URL`/`PGHOST`，且平台没有自定义 env/secret 注入口 | 进程内 `Object.keys(process.env)`                                                                                                                                                                 |
| 6   | 实例数               | 观测窗口内**单实例**（pid 恒为 11/13，计数器单调递增）；重发布必换实例、进程内状态全清                                                                                                                                                                                                         | 连续 14 次请求 pid 不变；跨发布回读文件失败                                                                                                                                                       |
| 7   | dist 打包格式        | 由受控发布工具接管（`entrypoint` + `port` 作为参数传入），App 侧无需压缩                                                                                                                                                                                                                       | 发布返回值 `filesUploaded: 1`                                                                                                                                                                     |
| 8   | 出网白名单           | **只放行 443**：PostgREST `GET /rest/v1/` → 200、`registry.npmjs.org` HTTPS → 200、TCP 443 → connected；对 supabase 主机 **TCP 5432 → timeout**                                                                                                                                                | 进程内 `net.connect` + `fetch` 探测                                                                                                                                                               |

## 由定论推导出的硬约束

**数据层只有一条路：PostgREST。** sqlite 与 pg 直连在 Pages 上都不可用，且都不是"可能不稳"而是必然失败：

- `dialect=sqlite`：应用根目录 `/opt/qwenwork-page/app` 对进程**只读**（实测 `mkdir ./data` → `EACCES`，写根目录文件同样 `EACCES`）。模板旧默认值 `SQLITE_PATH=./data/app.db` 因此**启动即崩**，不是"数据会丢"。
- 唯一可写区 `QWENWORK_WRITABLE_DIR`（实测解析为 `/tmp/qwenwork-page`）**跨发布清空**：重发布后回读，`preExisted:false`、历史条目全丢；同时 `/tmp/<自建目录>` 也一并被清。→ 任何本地文件都不能当持久层。
- `dialect=pg`：`SUPABASE_PROJECT_REF`/`SUPABASE_DB_PASSWORD`/`DATABASE_URL` 一个都不注入，且没有注入口；叠加 5432 出网被禁 → 双重不可用。

**PostgREST 能力矩阵（全部实测通过）**：`INSERT + Prefer:return=representation` → 201；`SELECT` 带 `eq.` / `is.null` / `in.()` / `order=<col>.desc` / `limit` / 指定列 → 200；`PATCH` + 过滤 + return → 200；`DELETE` + 过滤 + return → 200（返回被删行，可直接用 `length>0` 判定）；批量插入数组 → 201。

**camelCase 列名可用**（这条曾是最大风险）：`pgCol` 配方不传 name 时用 JS 属性名做列名，故 `todos` 的真实列是 `ownerSub`/`createdAt`。实测 `ownerSub=is.null` 命中、`order=createdAt.desc` 生效、`PATCH {"ownerSub":...}` 后再查 `is.null` 落空 → 大小写敏感列名全链路可用，**不需要**为了 Pages 把 schema 改成 snake_case。

**两个必须写进代码的失败形态**：

1. RLS 缺 policy 时是**静默失败**：`SELECT` 返回 `200 []`（看着像空库），`INSERT` 返回 **HTTP 401** + `{"code":"42501"}`（不是 403）。→ `RestError` 对 42501/404 附中文 hint。
2. upsert 必须显式给冲突目标：唯一列不是主键时，只给 `Prefer: resolution=merge-duplicates` 得到 **409/23505**；加 `?on_conflict=<唯一列>` 才返回 200 合并行。另注意被 RLS 拒掉的写入**仍会消耗序列值**。

**建表与 policy 只能在部署期做**：App 无 DDL 权限；受控迁移角色对 `storage` schema 也无权（实测 `INSERT INTO storage.buckets` → `42501 permission denied for schema storage`）。→ 迁移轨从"双方言"变成"双轨 + 平台受控轨"：Pages 形态用 `qwenwork_pages_apply_migration` 执行 `drizzle/pg` 产出的 SQL。

**`/healthz` 归网关**：请求**不下发到 App 进程**（探针 `serve` 计数不增），网关自答 `ok`（text/plain）。→ App 的健康检查路径改为 `/_healthz`，由 core 的 `HEALTHZ_PATH` 单点定义，app-kit 注册与 license guard 豁免清单同源读取。

**对象存储在 Pages 上不可用**：`GET /storage/v1/bucket` 可达（200，返回空数组），但 anon 建桶被 RLS 拒（400 内含 `403 new row violates row-level security policy`），受控迁移角色又对 `storage` schema 无权 → **桶建不出来**，upload/download 一律 `Bucket not found`。PRD 的"图床刚需"在 Pages 形态目前无解，除非平台侧预置桶。

## 已落地的适配点

| 适配点文件                                       | 改动                                                                                                                                                                                                                                    |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/core/src/runtime.ts`                   | `QW_PAGES_ENV_MARKERS` 换成实测注入的 `QWENWORK_WRITABLE_DIR` / `SUPABASE_INSTANCE_ID`；新增 `HEALTHZ_PATH` + `healthzPathFor()` 同源常量                                                                                               |
| `packages/app-kit/src/runtime/qw-pages.ts`       | `start()` 改为真监听（复用 `listenWithNodeServer`，缺省 8081 + `HOST`）；删除 `exportHandlers` 三导出对冲；`assetsDir` 不再用 `import.meta.url` 回溯（按 npm 依赖消费时会指到 `node_modules` 内），改为 `HOMURA_ASSETS_DIR ?? 'client'` |
| `packages/app-kit/src/runtime/node.ts`           | 抽出 `listenWithNodeServer`（读 PORT + HOST）供两形态共用                                                                                                                                                                               |
| `packages/app-kit/src/create-app.ts`             | `healthz.path` 可配，缺省按形态取；返回值新增 `healthzPath`                                                                                                                                                                             |
| `packages/app-kit/src/static.ts`                 | SPA fallback 保留前缀含两形态健康检查路径；`decodeURIComponent` 异常吞掉转 404（旧行为 500）                                                                                                                                            |
| `packages/license/src/guard.ts`                  | 豁免清单改为 `createDefaultBypass({ healthzPath })`，与 app-kit 注册路径同源                                                                                                                                                            |
| `packages/db/src/postgrest.ts`                   | 新增 PostgREST 客户端（select/insert/update/remove + upsert + RestError hint）                                                                                                                                                          |
| `packages/db/src/rest-schema.ts`                 | 新增：从 pg schema **派生**表描述符（不手写第三份 schema）                                                                                                                                                                              |
| `packages/db/src/rest-ttlkv.ts`                  | 新增：ADR-010 的 DB 版 TTL-KV 在 REST 形态的实现                                                                                                                                                                                        |
| `packages/db/src/pg/supabase.ts`                 | 删除"qw-pages 允许 TCP 出网 → PG 直连可行"的错误前提；`loadSupabaseEnv` 只返回 `dbConfig`（不再顺带 platformUrl/anonKey）                                                                                                               |
| `packages/storage/src/supabase.ts`               | 新增 `loadSupabaseStorageEnv`（只需 `SUPABASE_URL` + `SUPABASE_ANON_KEY`），解除对 PG 凭据的连带依赖                                                                                                                                    |
| `templates/hono-react/src/server/env.ts`         | `DIALECT` 增加 `rest` 且**去掉默认值**；新增 `resolveDialect()`（standalone→sqlite，qw-pages→rest）；新增 `SUPABASE_URL` / `STORAGE_SUPABASE_BUCKET`                                                                                    |
| `templates/hono-react/src/server/db.ts`          | `DbBundle` 改为 `kind` 判别联合；rest 分支；在 Pages 上显式选 sqlite/pg 时抛可行动错误；`migrate()` 对 rest 改为探活校验                                                                                                                |
| `templates/hono-react/src/server/schema/rest.ts` | 新增（派生，零手写）                                                                                                                                                                                                                    |
| `templates/hono-react/src/server/todos-repo.ts`  | 新增 `buildRestTodoRepo`（ISO 时间串 → epoch）                                                                                                                                                                                          |
| `templates/hono-react/src/server/app.ts`         | 按 `kind` 选 repo；auth/license 在 rest 形态**不启用并 warn**；storage 换用 REST env loader；`secureCookies` 由 `adapter.trustProxy()` 接线；健康检查路径与 guard 同源                                                                  |
| `templates/hono-react/src/server/qw-pages.ts`    | 改为监听形态，与 `index.ts` 同构；顺带移除 `export const fetch` 对全局 fetch 的遮蔽                                                                                                                                                     |
| `templates/hono-react/scripts/build.mjs`         | 更正"不赌平台装依赖"的依据；manifest 增加 `measured` 段                                                                                                                                                                                 |

## 仍未验证 / 已知缺口

- [ ] **REST 形态的 auth 与 license 未实现**：`@homurajs/auth` 的 session store 与 `@homurajs/license` 的 state store 只有 drizzle 版；Pages 上二者当前**不启用**（app.ts 打 warn）。补齐需 `createRestSessionStore` / `createRestStateStore`，表结构沿用 `refresh_tokens` / `license_state`。→ PRD 场景 2 的"钉扫码登录"在 Pages 上仍不可用。
- [ ] 多实例是否真会扩容（只观测到单实例）；若会，`createMemoryTtlKv` 存的 OAuth state 必须换 `createRestTtlKv`。
- [ ] `/storage/v1` 的 upload/download 全链路（因建不出桶而无法测）。
- [ ] 真实模板产物（`pnpm build:qw-pages` 的 tsdown 全打包路径）在 Pages 上的端到端验证——本轮实验用的是 npm 直装 + 手写入口。
- [ ] `Accept-Profile: public` 与 `Accept-Profile: tenant_<instance>_schema` 返回相同结果的原因未查（结论：Pages 上不需要设置该头，默认 schema 已含租户 schema）。

## 复现方法

最小发布目录 = `package.json`（依赖 `@homurajs/app-kit` + `@homurajs/core` + `hono` + `@hono/node-server`，用 `npm install --omit=dev --no-bin-links` 预装，避免 `.bin` 符号链接违反发布物约束）+ 单文件 ESM 入口 + `client/`。入口同时挂 `serve()` 与三重导出并各自计数，即可一次判决入口约定；`/api/db`、`/api/fs`、`/api/camel` 分别判决 PostgREST 权限、落盘持久性、camelCase 列名。发布用受控工具（`category: dynamic`、`entrypoint`、`port: 8081`、`with_database: true`），建表与 policy 用 `qwenwork_pages_apply_migration`。

## 约束

- 任何新确认只改上表适配点文件，不散落到能力包
