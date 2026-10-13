# DECISIONS

## ADR-001：Suzuran 原地重生为 homura，旧资产归档

- 日期：2026-10-13
- 状态：已采纳
- 背景：Suzuran Cloud（Go 多租户 PaaS）方向验证失败；新方向为 AI 开发的独立轻应用 SDK
- 考虑过的方案：新开 repo / 原地改造 / 归档后重开
- 决策：原地改造（GitHub remote 已是 suzuran-workshop/homura），`archive/suzuran-final`（tag）+ `archive/suzuran`（branch）双保险已推送，main 清场重来
- 为什么选这个：保留 39 commits 考古价值与 remote 连续性；git show archive:... 随时取阅
- 后果：历史里 Go 代码永久可考；新代码从 0 计数
- 何时重新审视：无需

## ADR-002：Drizzle ORM 1.0.0-rc.4 精确锁版，双 driver

- 日期：2026-10-13
- 状态：已采纳
- 背景：需要 pg + node:sqlite 双方言；stable 0.45.4 无 node-sqlite driver（仅 sqlite-proxy）
- 考虑过的方案：drizzle stable + 自写 30 行 proxy 适配 / 无 ORM 自研薄适配层 / drizzle 1.0-rc
- 决策：drizzle-orm@1.0.0-rc.4 + drizzle-kit@1.0.0-rc.4 精确锁（根 pnpm.overrides 强制统一）；postgres-js 罩 pgsql+supabase，node-sqlite 罩单机
- 为什么选这个：官方 migrator 全套（已验证 rc.4 含 node-sqlite/migrator）；自研适配层维护成本长期更高
- 后果：rc 期间 API 动荡风险 → 升级只走独立 PR，必跑 parity + 迁移往返测试；drizzle import 收敛 @homurajs/db 缩小波及面
- **修订（2026-10-13）**：「postgres-js 罩 supabase」只适用于**自托管 supabase**。qw-pages 上 PG 直连双重不可用（平台不下发 PROJECT_REF/DB_PASSWORD/DATABASE_URL 且无注入口；5432 出网实测 timeout），该形态改走 PostgREST（见 ADR-017）
- 何时重新审视：drizzle 1.0 正式发布时

## ADR-003：双方言双文件 + 配方 + parity 测试，而非运行时包装器

- 日期：2026-10-13
- 状态：已采纳
- 背景：drizzle pg-core/sqlite-core 必须分别声明 schema
- 考虑过的方案：运行时包装器统一 API / colocated 双文件
- 决策：App 写 colocated `schema/pg.ts` + `schema/sqlite.ts`；@homurajs/db 提供 pgCol/sqliteCol 列配方与 pgJson/sqliteJson 压重复；assertSchemaParity 测试硬门禁（表名/列名/主键，含列级 primary 标记）
- 为什么不选包装器：与 drizzle 泛型系统打架，类型推导损失大
- 后果：特性限双方言共有子集；差异映射文档化（specs/module-schema）
- 何时重新审视：drizzle 1.0 若提供单 schema 双方言生成

## ADR-004：内部包源码直出 + 派生式消费（v1 不发 npm）

- 日期：2026-10-13
- 状态：**已被事实推翻（2026-10-13 起 npm 直发）**
- 背景：App 全部 AI 开发、上传的是 dist bundle，无需公共分发
- 决策：exports 直指 src/index.ts（不预编译）；App 消费方式 = 派生本仓库（workspace 引用），模板 build 时整体打包
- 后果：省去 7 包 × 双格式构建维护；未来发 npm 需补 build 链
- **修订（2026-10-13）**：`@homurajs/*` 已按 CalVer 发版（首个版本 26.10.13，tag 触发 CI），`publishConfig.exports` 切到 `dist/*.js` + `dist/*.d.ts`。两条消费路径并存且互不干扰：
  - workspace 派生：仍走源码直出 → 教训 7 的 `noExternal: [/^@homurajs\//]` 只对这条路径成立
  - npm 消费：拿构建产物 → **无需 bundle**。实测在 qw-pages 上以 `npm install --omit=dev --no-bin-links` 预装的 `node_modules` 直接 `import '@homurajs/app-kit'` 跑通（运行时解析到 `/opt/qwenwork-page/app/node_modules/...`）
- 何时重新审视：无需（已落地）

## ADR-005：渐进式耦合为全项目最高设计原则

- 日期：2026-10-13
- 状态：已采纳
- 背景：App 形态多样（纯展示→全家桶），强制依赖造成负担
- 决策：零注入也能跑（纯 routes）；app-kit 只依赖 hono+core，能力实例由 App 构造后传入；可选重依赖走 peer optional + 动态 import（s3 的 AWS SDK）+ 子路径拆分（db/pg、3p/dingtalk、storage/*）
- 后果：sqlite-only App 零 postgres 依赖；不用钉钉的 App 零钉钉代码进 bundle
- 何时重新审视：无需（结构性原则）

## ADR-006：@homurajs/3p 第三方平台能力分片抽象

- 日期：2026-10-13
- 状态：已采纳
- 背景：钉钉只是平台之一（未来企微/飞书）；平台只实现部分能力
- 考虑过的方案：dingtalk 专用包 / 通用平台抽象
- 决策：Capability = oauth|message|approval|contacts（webhook 留未来）；ThirdPartyPlatform 声明式 capabilities + supports() 类型守卫运行时协商；dingtalk 首个实现（能力按配置动态声明：oauthOrgId 缺失则不声明 oauth）
- 为什么不选专用包：换平台要改 App 代码；抽象后模板零改动
- 后果：未声明能力调用会在类型层被拦、运行时 undefined；钉钉实现于 ./dingtalk 子路径隔离
- 何时重新审视：第二个平台（企微/飞书）落地时验证抽象

## ADR-007：auth = 通用 OAuth2 客户端，OAuth 预设来自 3p

- 日期：2026-10-13
- 状态：已采纳
- 背景：登录服务端已由 ../oauth2-dingtalk 承担（已上线）；homura 只做客户端
- 决策：OAuth2Client 只实现标准 code flow（三端点可配）；3p 各平台提供 OAuthPreset（endpoints+mapUser）喂给客户端；3p 与 auth 零 import（结构化契约鸭子类型互操作，避免依赖环）
- 后果：换 IdP = 换 3p 预设，auth 零改动；Suzuran 的「无 KV 放行 state」后门改为显式 allowNoState dev opt-in
- 何时重新审视：出现非 code-flow 需求（设备码等）

## ADR-008：session = HS256 短 JWT + opaque refresh rotate + 族吊销 + 静默重授权兜底

- 日期：2026-10-13
- 状态：已采纳
- 背景：oauth2-dingtalk 不支持 refresh token；旧 SDK 最大债务是 token 15 分钟无刷新
- 考虑过的方案：纯 302 静默重授权 / 纯无状态 JWT / 自管 opaque 全套
- 决策：HS256（jose）2h JWT HttpOnly cookie + 32B opaque refresh（SHA-256 入库、每次 rotate、familyId 复用检测整族吊销、30d）；refresh 链终态时页面请求 302 回 /auth/login 兜底
- 为什么：静默重授权是钉钉特性不能当主机制（换 IdP 可能弹 consent）；license 停服/踢人需要可吊销的服务端记录；自签自验场景 HS256 足够（RS256 的多验签方价值不适用）
- 何时重新审视：出现多服务共享验签时升 RS256

## ADR-009：舍弃多租户/org 模型（单租户轻应用）

- 日期：2026-10-13
- 状态：已采纳
- 背景：Suzuran 的 org 选择/角色体系是 PaaS 语境；homura 的 App 是独立单租户应用
- 决策：不做 org 概念；用户身份以 { sub, nickname?, avatarUrl? } 为基础，App 自行扩展绑定表
- 何时重新审视：无需

## ADR-010：TTL-KV 内存为缺省、DB 实现兜底，不引 Redis

- 日期：2026-10-13
- 状态：已采纳
- 决策：createMemoryTtlKv 缺省（单实例足够）；多实例部署用 createDbTtlKv（双方言 DELETE RETURNING）；不引入 Redis 依赖
- 为什么：轻应用多单实例；qw-pages 多实例未知时用 DB 实现对冲
- 何时重新审视：真实多实例场景出现性能问题

## ADR-011：license fail-open + 宽限期

- 日期：2026-10-13
- 状态：**已修订（2026-10-14，homura-genuine 落地并双端联调后）**
- 背景：守卫不应让 App 因授权服务器故障而宕机；但制作人需要即时停服权
- 决策：心跳失败走宽限期（server 下发 graceSec），期内继续服务；server 明示 suspended 立即 503（即时停服权保留）；/healthz 与 /auth/* 豁免；strict 模式可选（未注册即停）
- **修订（2026-10-14）**：
  - fail-open 必须覆盖**启动期**：原实现里 `onStart` 的 `register()` 抛错会冒到 `main()` 的 catch → `process.exit(1)`，等于"授权中心在 App 启动那一刻不可达或返回 4xx → 全站宕机"。双端联调时真实触发（残留的旧 genuine 进程导致 `instance_mismatch` 403，App 当场退出）。改为 warn 后继续启动，状态停在 `unknown`，靠心跳循环重试
  - 豁免清单增加 `/_license`：`enforcement=all` 时它必须仍可读，否则前端连"为什么全站 503"都问不到，强提醒无从展示
  - 健康检查路径不再硬编码 `/healthz`，改由 core `healthzPathFor` 同源提供（见 ADR-018）
  - "停服"从单一 503 扩成四档处置（见 ADR-020）；即时停服权保留在 `all` 档
- 何时重新审视：按运营经验调参（genuine 已上线）

## ADR-012：qw-pages 适配集中 RuntimeAdapter + 三导出对冲 + 自包含 bundle + manifest

- 日期：2026-10-13
- 状态：**已修订（2026-10-13 实测后）**——保留 RuntimeAdapter 单点收口，退役三导出对冲
- 背景：qw-pages 入口约定未知（Node 版本/导出形态/是否装依赖/静态服务方）
- 决策：跨形态差异全走 RuntimeAdapter；qw-pages.ts 同时导出 default/fetch/app 三形态；构建为自包含单文件（不赌 qw-pages 侧 npm install）；产物附 homura.manifest.json；specs/module-qw-pages 维护待确认清单
- 后果：约定确认后只改 qw-pages.ts + build.mjs 两个文件
- **修订依据（线上探针实测，详见 specs/module-qw-pages）**：
  - 「三导出对冲」**证伪并删除**：平台从不调用导出函数（探针双路计数 `serve` 47 次 / `handler` 0 次），动态页是常驻进程 + 反代 PORT/HOST。`createQwPagesAdapter().start()` 原本抛错拒绝监听，恰好禁掉了唯一正确的做法；现改为与 standalone 共用 `listenWithNodeServer`
  - 「不赌平台 npm install」**依据替换**：平台确实不装依赖，但发布目录里现成的 `node_modules` 会被原样打包且运行时可解析。自包含单文件从"保命手段"降级为"体积/简单性选择"，予以保留
  - 「manifest」**降级为文档**：发布的 entrypoint/port 由受控发布工具参数决定，平台不读该文件（推断，非实测）
  - 四重对冲中三重退役，印证遗产教训 2「抽象层设计好但不接线等于没有」：RuntimeAdapter 保留，但只承载**真实**差异（端口/HOST/静态目录缺省值），且 `trustProxy()` 已接线到 auth 的 cookie `secure`
- 何时重新审视：平台运行时契约变更时（探针可复跑）

## ADR-013：钉钉 webhook 回调本轮不做

- 日期：2026-10-13
- 状态：已采纳
- 背景：Suzuran 从未实现；需公网入口 + AES 加解密 + 事件去重；无真实企业凭据联调
- 决策：spec 占位（004）+ 设计草案；未来作为 3p 的 webhook capability
- 何时重新审视：有凭据 + 公网入口的联调条件时

## ADR-014：jose 选型（JWT 库）

- 日期：2026-10-13
- 状态：已采纳
- 决策：session JWT 用 jose（维护活跃、零依赖、Web Crypto 兼容）
- 何时重新审视：无需

## ADR-015：推翻旧 SDK 零依赖决策

- 日期：2026-10-13
- 状态：已采纳
- 背景：Suzuran packages/sdk 的零依赖决策导致无中间件/无文件上传（DECISIONS 2026-08-04）
- 决策：接受合理运行时依赖（hono/jose/drizzle），以 peer optional + 动态 import + 子路径控制耦合面
- 何时重新审视：无需

## ADR-016：全文档 UTF-8 简体中文

- 日期：2026-10-13
- 状态：已采纳
- 背景：Suzuran DECISIONS.md 曾出现 GBK 混编码段
- 决策：所有文档统一 UTF-8 简体中文；commit 遵循 Conventional Commits（描述简体中文）
- 何时重新审视：无需

## ADR-017：qw-pages 数据层走 PostgREST，表描述符从 pg schema 派生

- 日期：2026-10-13
- 状态：已采纳
- 背景：实测排除了 Pages 上另外两条路——`node:sqlite`（应用根目录只读，`mkdir ./data` → EACCES；唯一可写区跨发布清空）与 PG 直连（无凭据 + 5432 出网 timeout）。剩下 PostgREST：`SUPABASE_URL` + `SUPABASE_ANON_KEY` 是平台唯一注入的可用凭据，实测全套算子可用且数据跨发布持久
- 考虑过的方案：① 引 `@supabase/supabase-js`；② 在 @homurajs/db 内手写零依赖 REST 客户端；③ 只在模板里写 repo，不进能力包
- 决策：选 ②。新增 `@homurajs/db` 主入口导出 `createRestDb`（select/insert/update/remove + upsert）、`createRestTtlKv`、`restSchemaFromPg`。表结构**不手写第三份**，由 `restSchemaFromPg(pgSchema)` 从 drizzle pg 表元数据派生
- 为什么不选 ①：与 storage 的既有风格不一致（那里已是手写 REST 零 SDK），且 SDK 会进 bundle；ADR-015 允许合理依赖，但此处零依赖即可完成
- 为什么派生而非按 ADR-003 再 colocated 一份 `schema/rest.ts`：PostgREST 用的就是 PG 真实列名，手写必然漂移（教训 6 的同类坑）。`pgCol` 配方不传 name 时列名是 JS 属性名 → `ownerSub`/`createdAt` 是 camelCase，手写极易错成 snake_case；派生让单一事实源留在 `schema/pg.ts`。camelCase 列名在 PostgREST 上已实测可用（`is.null` 过滤 / `order=<col>.desc` / PATCH 全通过），故**不需要**为 Pages 改列名策略
- 后果：
  - 迁移从双轨变三轨——Pages 形态的建表与 RLS policy 只能在部署期用平台受控迁移执行 `drizzle/pg` 的 SQL（App 无 DDL 权限）
  - 两类静默失败必须在代码里显式化：RLS 缺 policy 时 SELECT 返回 `200 []`、INSERT 返回 **401**（PG code 42501，不是 403）；upsert 在唯一列非主键时必须给 `?on_conflict=`，否则 409/23505。`RestError` 对这几类附中文 hint
  - 被 RLS 拒掉的写入仍消耗序列值 → 不能用 id 连续性判断写入成功
  - **能力缺口（已部分补齐）**：`createRestSessionStore`（auth）与 `createRestStateStore`（license）已实现，REST 形态下两层照常启用；consume 的原子抢占用 `PATCH + 过滤 + return=representation` 表达，与 SQL 版 `UPDATE...WHERE used_at IS NULL RETURNING` 等价，且已在线上实测（三路并发抢占恰好一个赢家、过期 token 不误报为复用、族吊销只命中未消费行）。**剩余阻塞不是 store 而是配置投递**：平台无自定义 env 注入口，`OAUTH_CLIENT_SECRET` 无处安放（烘进 bundle = 把密钥发到公网产物），故 PRD 场景 2 的"钉扫码登录"在 Pages 上仍不可用，待做方案是部署期把配置写入 `homura_config` 表、启动时经 PostgREST 读取。store 函数本身尚未在部署态执行过（受此阻塞），但单测断言的请求形状已逐个线上验证
  - 对象存储在 Pages 上不可用：anon 建桶被 RLS 拒，受控迁移角色对 `storage` schema 也无权（42501）→ 桶建不出来
- 何时重新审视：平台开放 service-role 凭据或 storage 建桶能力时

## ADR-018：形态相关的路径常量单点定义（健康检查）

- 日期：2026-10-13
- 状态：已采纳
- 背景：实测 `/healthz` 被 qw-pages 的 Page Gateway 保留——网关自答 `ok`（text/plain），请求**不下发到 App 进程**（探针 serve 计数不增）。原实现把 `/healthz` 硬编码在三处：app-kit 注册路由、license guard 豁免清单、static SPA fallback 的保留前缀
- 决策：core 新增 `HEALTHZ_PATH` + `healthzPathFor(target)`（standalone `/healthz`，qw-pages `/_healthz`）；app-kit 的 `healthz.path` 缺省取它并把实际路径回传（`HomuraApp.healthzPath`）；license guard 的默认豁免清单改为 `createDefaultBypass({ healthzPath })`；模板把 `built.healthzPath` 同时喂给两侧
- 为什么：只改 app-kit 会让停服时健康检查一起被 503，正好毁掉 ADR-011 的语义；三处各写一份必然漂移（教训 2）
- 后果：`/healthz` 在 Pages 上不能用作应用健康判据（网关的 `ok` 与 App 无关）；健康检查改看 `/_healthz`
- 何时重新审视：平台放开 `/healthz` 时

## ADR-019：配置与密钥随产物携带（env 行格式文件）+ 启动期缺省密钥断言

- 日期：2026-10-13
- 状态：已采纳
- 背景：Pages 只注入固定 12 个 env 且**无自定义注入口**，`SESSION_SECRET` / `OAUTH_CLIENT_SECRET` 无处投递。原先判断"烘进产物等于把密钥发到公网"，实测推翻：`/homura.config.env`、`/server/*.mjs`、`/config/*` 一律被 SPA fallback 兜成 index.html，`%2e%2e` 变体被网关 400，`/.env` 被网关 403；对照组 `/assets/*.js` 正常返回 225KB JS（排除假阴性）。产物不可读的原因是 App 只从 `client/` 提供静态文件
- 考虑过的方案：① 随产物携带配置文件；② 部署期写入 `homura_config` 表、启动时经 PostgREST 读；③ 烘进 bundle 常量
- 决策：选 ①，格式用 **env 行（KEY=VALUE）而非 yaml/json**。core 新增 `env-file.ts`（`parseEnvFile` / `resolveConfigFilePath` / `applyEnvFile`，零依赖），模板 `loadConfig()` 先并入文件再走 `defineConfig`。定位优先级 `HOMURA_CONFIG_FILE` → `<cwd>/homura.config.env` → `QWENWORK_WRITABLE_DIR/homura.config.env`；**真实 env 优先于文件**
- 为什么是 env 行格式：配置面已经是 env 形状（`configSpecs` + `defineConfig`），并入 `process.env` 后能力包零改动、`secret:true` 的日志脱敏继续生效，且不引 YAML 解析器。要 yaml 时加一个 source 适配即可，属加法
- 为什么不选 ②：`homura_config` 表的 anon SELECT policy 意味着**持有 anon key 即可读到密钥**，信任边界比"随产物携带"更宽；且启动多一次网络依赖、部署配方多一张表。可作为将来的"免重建轮换"叠加层，不作主通道
- 配套安全修复：`SESSION_SECRET` 的缺省值是**提交在仓库里的公开字符串**，Pages 上又无法用 env 覆盖 → 启用 auth 的部署等于用公开密钥签 HS256，任何人可伪造会话。故 `loadConfig` 末尾 `assertSecretsOverridden`：qw-pages 或 `NODE_ENV=production` 下仍是缺省值则**启动即拒绝**（standalone 开发态放行）
- 后果：
  - `config/homura.config.env` 由 build 拷进 `dist/`，已加入 `.gitignore`（源与产物两处）；派生 App 的部署流程需要"填配置 → build → 发布"这一步
  - 密钥轮换需重新发布，或把文件投放到 `QWENWORK_WRITABLE_DIR`（该目录跨发布清空，只适合临时覆盖）
  - **残留风险**：只验证了"经运行中的 App 读不到"，平台产物存储自身的 ACL 未验证；正式承载真实凭据前应向平台确认有无产物下载入口
- 实测：V10 部署带 canary 配置 → `/auth/login` 返回 302，`Location` 含只可能来自文件的 `canary_org_9f3a` 与 `canary-client-id`；且因 `authorizeUrl` 在返回前 `await stateKv.set()`，该 302 同时证明 `createRestTtlKv` 的 upsert 在部署态跑通。全站扫 canary 零命中
- 何时重新审视：平台开放自定义 env/secret 注入时（届时文件通道降级为本地开发用途）

## ADR-020：授权载荷 Ed25519 签名，到期与功能范围由中心控制

- 日期：2026-10-14
- 状态：已采纳
- 背景：产品要求 ① 中心可设置每个 App 实例的到期时间且**随时可调**，消费侧一旦发现过期就按设置禁用全部/核心功能，并对所有用户**每次使用强提醒**；② 每张许可证携带**签名的**功能范围，从而对不同持有者开放不同能力。原契约只有 active/grace/suspended 三态，无到期、无功能范围、无签名
- 考虑过的方案：① 响应体加字段但不签名；② HMAC 对称签名；③ Ed25519 非对称签名整个载荷
- 决策：选 ③。新增 `LicenseEntitlement`（status / expiresAt / enforcement / features / notice / instanceKey / serverTime / 心跳参数）与 `SignedEntitlement`（signature + keyId），register 与 heartbeat 都下发
- 为什么不选 ①：中心响应可被中间人改写，把 `expired` 改成 `active` 就绕过了全部控制
- 为什么不选 ②：对称密钥必须随 App 产物分发，而产物会落到别人的部署环境 → 拿到产物即可自签"永不过期 + 全功能"。非对称下 App 只嵌公钥
- 为什么 Ed25519 而非 RS256：`node:crypto` 原生（契约文件不许引第三方，它会被打进每个派生 App 的 bundle）、签名固定 64B、无填充/哈希算法协商面
- **签什么**：整个载荷。`instanceKey` 签进去防把授权重放到别的实例；`expiresAt` 防改到期日；`serverTime` 供消费侧校正时钟偏差、防回拨系统时间绕过到期；`enforcement`/`features`/`notice` 防篡改者自选最宽处置、自己加功能、抹掉提醒
- **消费侧铁律**：验签不通过时，载荷里的任何字段都不得用于决策——enforcement 取最严 `all`、features 全拒、notice 换成安全告警。这条是被自己的测试抓出来的真漏洞（`requireFeature` 原先直接读 `getEntitlement().features`）
- 处置分两维：`status` 说"发生了什么"，`enforcement` 说"该拦多少"（none/notice/core/all），`notice` 说"怎么告诉用户"。三者都由中心控制、可随时调整；`active` 时 enforcement 恒为 `none`，不给消费侧留误拦余地
- `core` 档刻意不拦页面与静态资源：用户得能打开界面，才看得到"为什么功能没了"
- 到期在消费侧**本地判定**（不等心跳），因为需求是"只要发现过期就处置"
- 后果：
  - 契约文件新增 `canonicalize` / `normalizePem` / `keyIdOf` / `verifyEntitlement` / `isEntitlementExpired`，全部纳入两侧逐字同步与 parity 测试——它们决定签名字节与 keyId，两侧不一致等于验签**静默**失效
  - 状态从三态扩成五态（新增 `expired`；`unknown` 仍仅消费侧）
  - App 侧必须配 `GENUINE_PUBLIC_KEY` 才有安全性；未配时 warn，且 features 一律拒绝
  - `keyId` 派生方式变更（规范化 PEM 后再哈希）→ 修复前建的中心库需重新生成密钥
  - 功能范围是**每许可证一份**（= 每个持有者/实例），同一 App 内所有终端用户相同；要做用户级授权是另一个数据模型
- 实测：与真实 genuine 进程双端联调八阶段（active → 改到期 → core 档 → notice 档 → all 档 → 续期 → 收回功能 → 手动停服 → 恢复），验签全程 verified。四个缺陷由联调与测试抓出并修复：keyId 对 PEM 空白敏感、requireFeature 采信未验签载荷、register 失败 exit(1)、active 时丢弃中心显式文案
- 何时重新审视：需要按终端用户（而非按许可证）授权时；或平台提供密钥托管/轮换自动化时
