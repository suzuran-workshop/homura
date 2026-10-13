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

| 适配点文件                                       | 改动                                                                                                                                                                                                                                                                                           |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/core/src/runtime.ts`                   | `QW_PAGES_ENV_MARKERS` 换成实测注入的 `QWENWORK_WRITABLE_DIR` / `SUPABASE_INSTANCE_ID`；新增 `HEALTHZ_PATH` + `healthzPathFor()` 同源常量                                                                                                                                                      |
| `packages/app-kit/src/runtime/qw-pages.ts`       | `start()` 改为真监听（复用 `listenWithNodeServer`，缺省 8081 + `HOST`）；删除 `exportHandlers` 三导出对冲；`assetsDir` 不再用 `import.meta.url` 回溯（按 npm 依赖消费时会指到 `node_modules` 内），改为 `HOMURA_ASSETS_DIR ?? 'client'`                                                        |
| `packages/app-kit/src/runtime/node.ts`           | 抽出 `listenWithNodeServer`（读 PORT + HOST）供两形态共用                                                                                                                                                                                                                                      |
| `packages/app-kit/src/create-app.ts`             | `healthz.path` 可配，缺省按形态取；返回值新增 `healthzPath`                                                                                                                                                                                                                                    |
| `packages/app-kit/src/static.ts`                 | SPA fallback 保留前缀含两形态健康检查路径；`decodeURIComponent` 异常吞掉转 404（旧行为 500）                                                                                                                                                                                                   |
| `packages/license/src/guard.ts`                  | 豁免清单改为 `createDefaultBypass({ healthzPath })`，与 app-kit 注册路径同源                                                                                                                                                                                                                   |
| `packages/auth/src/session/rest-store.ts`        | 新增 `createRestSessionStore`：PostgREST 版 RefreshTokenStore。consume 的**原子抢占**用 `PATCH ?token_hash=eq&expires_at=gt&used_at=is.null` + `return=representation` 表达，返回空数组即抢占失败——与 SQL 版 `UPDATE...WHERE used_at IS NULL RETURNING` 等价（延续教训 8「先占后判」）         |
| `packages/license/src/rest-state-store.ts`       | 新增 `createRestStateStore`：PostgREST 版 LicenseStateStore（save 用 `on_conflict=id` upsert；**不建表**，无 DDL 权限）                                                                                                                                                                        |
| `packages/db/src/postgrest.ts`                   | 新增 PostgREST 客户端（select/insert/update/remove + upsert + RestError hint）                                                                                                                                                                                                                 |
| `packages/db/src/rest-schema.ts`                 | 新增：从 pg schema **派生**表描述符（不手写第三份 schema）                                                                                                                                                                                                                                     |
| `packages/db/src/rest-ttlkv.ts`                  | 新增：ADR-010 的 DB 版 TTL-KV 在 REST 形态的实现                                                                                                                                                                                                                                               |
| `packages/db/src/pg/supabase.ts`                 | 删除"qw-pages 允许 TCP 出网 → PG 直连可行"的错误前提；`loadSupabaseEnv` 只返回 `dbConfig`（不再顺带 platformUrl/anonKey）                                                                                                                                                                      |
| `packages/storage/src/supabase.ts`               | 新增 `loadSupabaseStorageEnv`（只需 `SUPABASE_URL` + `SUPABASE_ANON_KEY`），解除对 PG 凭据的连带依赖                                                                                                                                                                                           |
| `templates/hono-react/src/server/env.ts`         | `DIALECT` 增加 `rest` 且**去掉默认值**；新增 `resolveDialect()`（standalone→sqlite，qw-pages→rest）；新增 `SUPABASE_URL` / `STORAGE_SUPABASE_BUCKET`                                                                                                                                           |
| `templates/hono-react/src/server/db.ts`          | `DbBundle` 改为 `kind` 判别联合；rest 分支；在 Pages 上显式选 sqlite/pg 时抛可行动错误；`migrate()` 对 rest 改为探活校验                                                                                                                                                                       |
| `templates/hono-react/src/server/schema/rest.ts` | 新增（派生，零手写）                                                                                                                                                                                                                                                                           |
| `templates/hono-react/src/server/todos-repo.ts`  | 新增 `buildRestTodoRepo`（ISO 时间串 → epoch）                                                                                                                                                                                                                                                 |
| `templates/hono-react/src/server/app.ts`         | 按 `kind` 选 repo 与 store（todos/auth/license 三处各有 SQL 与 REST 两套实现）；REST 形态的 OAuth state 用 `createRestTtlKv`（内存 KV 在 Pages 上重启即清，登录会断在跳转与回调之间）；storage 换用 REST env loader；`secureCookies` 由 `adapter.trustProxy()` 接线；健康检查路径与 guard 同源 |
| `templates/hono-react/src/server/qw-pages.ts`    | 改为监听形态，与 `index.ts` 同构；顺带移除 `export const fetch` 对全局 fetch 的遮蔽                                                                                                                                                                                                            |
| `templates/hono-react/scripts/build.mjs`         | 更正"不赌平台装依赖"的依据；manifest 增加 `measured` 段                                                                                                                                                                                                                                        |

## 真实产物端到端验证（已做）

`pnpm build:qw-pages` 的 tsdown 全打包产物直接发布，实测通过：

- `/_healthz` → `{"status":"ok","runtime":"qw-pages","checks":{"db":"ok"}}`。这一条同时证明四件事：真实产物能启动、`detectRuntime` 在线上正确识别为 **qw-pages**（标记修复生效）、`resolveDialect` 自动选了 **rest**（若误选 sqlite 会在建库时撞 EACCES 而起不来）、PostgREST 探活成功
- `/healthz` → 仍是网关自答的 `ok`（text/plain），印证健康检查必须让开这个路径
- todos 全链路：`GET {"todos":[]}` → `POST` 201（uuid 由 DB 生成、`createdAt` 由 ISO 串正确转成 epoch ms）→ `GET` 返回该行 → `PATCH` 200 且 `done:true` → `DELETE` 200 `{"ok":true}` → `GET` 空 → 再 `DELETE` 404
- SPA 与静态：`/` 200（title `homura app`，被平台注入 chrome 后 14435B），`/assets/index-*.js` 200 `text/javascript` → 新的 `assetsDir` 缺省 `client` 正确
- `/api/me` → `{"user":null}`（未配 OAuth，符合预期）

**产物形态更正**：不是「自包含单文件」。tsdown/rolldown 会代码分割，实测产出 **30 个文件 / 2.1MB**（入口 `server/index.mjs` + 26 个 chunk）。自包含性成立——真实 import 语句里的裸包只剩 Node 内置（`stream`/`crypto`/`fs`/`net`/`os`/`tls`/`http2`/`http`/`perf_hooks`，均来自打包进来的 `@hono/node-server`），无第三方裸包、无裸动态 import。

> 排查提示：用 `grep "from 'drizzle-orm/pg-core'"` 这类宽松模式检查自包含性会**误报**——drizzle 源码的 JSDoc 里有 `* import { union } from 'drizzle-orm/pg-core'` 这样的示例文本。必须只匹配行首的真实 `import`/`export` 语句。

## 部署配方（REST 形态必需的表）

App 无 DDL 权限，表与 policy 必须在部署期用 `qwenwork_pages_apply_migration`（需传 provision 返回的 `domain`）建。SQL 取 `drizzle/pg` 的迁移产物并改成幂等（`IF NOT EXISTS`），另加 REST 版 TTL-KV 用的 `homura_ttlkv`：

| 表               | 用途                                                | 来源                                                |
| ---------------- | --------------------------------------------------- | --------------------------------------------------- |
| `todos`          | 业务表（camelCase 列：`ownerSub`/`createdAt`）      | `drizzle/pg/*/migration.sql`                        |
| `refresh_tokens` | session store（snake_case 列）                      | 同上（由 `@homurajs/auth/tables` spread 进 schema） |
| `license_state`  | license state store                                 | 同上（由 `@homurajs/license/tables` spread）        |
| `homura_ttlkv`   | OAuth state 的 TTL-KV（`key`/`value`/`expires_at`） | 无 drizzle schema，SQL 见 `createDbTtlKv` 的 DDL    |

上表是**模板缺省**的四张，不是平台常量：派生 App 新增的每张业务表都要一并建（登记进 `schema/rest.ts` 的 `restBusinessTables` 后，模板的 `requiredTables` 会自动把它纳入部署期探活与 `/_healthz` 的 db 检查）。实际必需集由 `app.ts` 的 `requiredTables` 决定：业务表恒需，`refresh_tokens`+`homura_ttlkv` 仅在配了 `OAUTH_DINGTALK_ORG_ID` 时需要，`license_state` 仅在配了 `GENUINE_SERVER` 时需要。

⚠ **首次部署要按目录时间序应用 `drizzle/pg/` 下全部迁移**，不是只应用最新那份——最新那份只含新增的表，基础表在更早的迁移目录里，漏了会启动探活失败。

每张表都要 `ENABLE ROW LEVEL SECURITY` + 一条 `FOR ALL TO anon USING (true) WITH CHECK (true)` 的 policy，否则就是前述静默失败（SELECT 200 空数组 / INSERT 401+42501）。这四张表都没有 serial 序列，无需 sequence 授权；`GRANT ... ON ALL SEQUENCES IN SCHEMA current_schema()` 是**语法错误**（该位置不接受函数调用），有 serial 表时要在 DO 块里用 `EXECUTE format(...)` 逐条授权。

## consume 原子抢占语义（已实测）

`createRestSessionStore.consume` 把 SQL 版的

```sql
UPDATE refresh_tokens SET used_at = ts
WHERE token_hash = ? AND expires_at > ts AND used_at IS NULL
RETURNING family_id, sid, sub, profile
```

翻译成 `PATCH /refresh_tokens?token_hash=eq.X&expires_at=gt.ts&used_at=is.null` + `Prefer: return=representation`。用零依赖探针（只用 `node:http` + 全局 fetch）直打真实 PostgREST 的结果：

| 判决项           | 结果                                                                                         |
| ---------------- | -------------------------------------------------------------------------------------------- |
| 首次抢占         | 200，返回 1 行                                                                               |
| 同 token 再抢    | 200，返回 **0 行**（= 抢占失败，store 据此进入查因分支）                                     |
| **三路并发抢占** | 三个请求都 200，返回行数 `[1,0,0]` → **恰好一个赢家**，原子性成立                            |
| 抢占后 `used_at` | 非空 → 复用检出（`revoked:true` → 吊销整族）可靠                                             |
| 过期 token       | 抢占 0 行且 `used_at` 仍为 null → store 返回 null，不会误报成复用                            |
| `revokeFamily`   | `?family_id=eq.F&used_at=is.null` 只命中未消费的行（5 行中命中 2 行，已消费的 3 行未被触碰） |

结论：REST 版与 drizzle 版的「先占后判」语义等价（教训 8 在 REST 侧同样成立），并发下不会重复发放会话。

## 配置与密钥投递（已实现并实测）

平台只注入固定 12 个 env 且无自定义注入口，故 `SESSION_SECRET` / `OAUTH_CLIENT_SECRET` 无法用环境变量投递。此前"烘进产物 = 把密钥发布到公网"的判断**已被实测推翻**：

| 请求                                       | 结果                                                             |
| ------------------------------------------ | ---------------------------------------------------------------- |
| `/homura.config.env`                       | 200，返回 SPA 的 index.html（14435B），canary 未出现             |
| `/server/index.mjs`、`/server/<chunk>.mjs` | 同上                                                             |
| `/config/homura.config.env`                | 同上                                                             |
| `/.env`                                    | **403**（网关层拒绝，1020B 错误页）——平台对点文件另有防护        |
| `/../server/index.mjs`                     | 200 SPA HTML（`safeResolve` 挡住穿越后落 fallback）              |
| `/%2e%2e/server/index.mjs`                 | 400（网关拒绝）                                                  |
| 对照组 `/assets/index-*.js`                | 200，225927B 真实 JS → 证明上述结果不是"什么都返回 HTML"的假阴性 |

原因：App 只从 `client/` 提供静态文件，服务端产物不在静态根下；未知路径被 SPA fallback 兜成 index.html。故**随产物携带配置文件**的信任边界与代码本身相同。

落地方式（core 新增 `env-file.ts`）：`homura.config.env`（KEY=VALUE 行格式，dotenv 语义子集，零依赖）在 `loadConfig()` 里先并入 env 再走 `defineConfig`，**真实 env 优先于文件**。定位顺序：`HOMURA_CONFIG_FILE` → `<cwd>/homura.config.env`（= 产物根）→ `QWENWORK_WRITABLE_DIR/homura.config.env`（平台可写区，可在不改产物的前提下投放/轮换）。选 env 行格式而非 yaml/json：配置面已经是 env 形状，能力包零改动，且不引解析器；需要 yaml 时是加法。

`build.mjs` 把 `config/homura.config.env` 拷进 `dist/`；该路径已被 `.gitignore` 覆盖（源目录与产物两处）。

**顺带修掉一个真实漏洞**：`SESSION_SECRET` 的缺省值 `dev-only-insecure-secret-change-me-32bytes!` 是**提交在仓库里的**，而 Pages 上又无法用 env 覆盖 → 任何启用 auth 的 Pages 部署都在用公开密钥签 HS256，任何人都能伪造 access/refresh token。现在 `loadConfig` 末尾调 `assertSecretsOverridden`：qw-pages 形态或 `NODE_ENV=production` 下若仍是缺省值，**启动即拒绝**并给出可行动信息（standalone 开发态放行，不挡本地开发）。

实测验证（V10，真实产物 + canary 配置）：`/auth/login` → **302**，`Location: https://dingtalk.auth.xrl.im/canary_org_9f3a/authorize?client_id=canary-client-id&redirect_uri=…&state=…`。orgId 与 clientId 只可能来自配置文件 → 文件确实在启动期被读取；`SESSION_SECRET` 也通过了断言（否则进程启动即退出）。又因 `OAuth2Client.authorizeUrl` 在返回 URL 前 `await stateKv.set(...)`，这个 302 同时证明 **`createRestTtlKv` 的 upsert 已在部署态对真实 PostgREST 跑通**（`homura_ttlkv` 表 + policy 生效）。

## 仍未验证 / 已知缺口

- [x] **配置与密钥投递**（见上节）：登录链的机制性阻塞已解除，`/auth/login` 在 Pages 上实测可用。
- [x] `consume` 依赖的 PostgREST 原子抢占语义已实测（见上节）。
- [ ] `createRestSessionStore` / `createRestStateStore` 的**函数体仍未在部署态执行过**：前者要等真实 IdP 走完 `/auth/callback`，后者要等 ../homura-genuine 上线。已验证的是它们依赖的 PostgREST 语义与请求形状（单测逐条断言）。
- [ ] **平台产物存储自身的 ACL 未验证**：本文只证明了"经运行中的 App 读不到"。若平台另有产物下载入口，"随产物携带密钥"的前提就不成立——正式承载真实凭据前值得向平台确认一次。
- [ ] 多实例是否真会扩容（只观测到单实例）。
- [ ] `/storage/v1` 的 upload/download 全链路（因建不出桶而无法测）。
- [ ] `Accept-Profile: public` 与 `Accept-Profile: tenant_<instance>_schema` 返回相同结果的原因未查（结论：Pages 上不需要设置该头，默认 schema 已含租户 schema）。

## 复现方法

最小发布目录 = `package.json`（依赖 `@homurajs/app-kit` + `@homurajs/core` + `hono` + `@hono/node-server`，用 `npm install --omit=dev --no-bin-links` 预装，避免 `.bin` 符号链接违反发布物约束）+ 单文件 ESM 入口 + `client/`。入口同时挂 `serve()` 与三重导出并各自计数，即可一次判决入口约定；`/api/db`、`/api/fs`、`/api/camel` 分别判决 PostgREST 权限、落盘持久性、camelCase 列名。发布用受控工具（`category: dynamic`、`entrypoint`、`port: 8081`、`with_database: true`），建表与 policy 用 `qwenwork_pages_apply_migration`。

判决 `consume` 原子抢占的探针更简单：**零依赖**（只用 `node:http` + 全局 fetch），发布目录只要 `package.json`（`type: module`）+ 一个 `server.mjs`，直接对 `refresh_tokens` 发同形请求并做三路 `Promise.all` 并发抢占，数返回行数即可。

真实产物验证则不需要探针：`pnpm build:qw-pages` 后直接把 `dist/` 发布（`entrypoint: server/index.mjs`），看 `/_healthz` 的 `runtime` 与 `checks.db` 就能一次确认形态识别、方言选择与 PostgREST 连通。

## 约束

- 任何新确认只改上表适配点文件，不散落到能力包
