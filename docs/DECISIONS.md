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

## ADR-021：大文件存储——分块 DB 兜底 + 预签名直传正解，data 列用 base64 文本

- 日期：2026-10-14
- 状态：已采纳
- 背景：qw-pages 上 local/s3/supabase 三后端全不可用（见 module-qw-pages.md），图床/文件能力在 Pages
  形态一度无解。DB-backed storage（二进制写进 PostgREST）是唯一可用数据路径，但撞上两道平台限制：
  网关（openresty）对单请求 body 有上限（实测 ≥1MB 直接 413，请求到不了 App），PostgREST 单值也
  ~1MB（768KB raw→base64 ~1MB 报 500）。且 PostgREST 对 `bytea` 的 JSON 编解码不可靠（实测 308B
  进去、618B mojibake 出来）。
- 考虑过的方案：
  - **单请求整文件 + bytea 列**：撞网关 body 限（≥1MB 413），且 bytea 过 PostgREST 往返损坏 → 否
  - **单请求整文件 + base64 text 列**：解决 bytea 损坏，但仍撞网关 body 限（>~512KB 就悬）→ 只够小文件
  - **强制分块 + base64 text 列**：每块 ≤384KB raw（base64 后 512KB），两道限制都避开 → 支持大文件
  - **预签名直传对象存储（浏览器直接 PUT 到 OSS/S3）**：字节不过 App、不过网关 → 大文件正解，但需对象存储 + CORS
  - **流式上传绕网关**：无效——网关会缓冲整个请求 body 再转发，流式上传照样撞 413
- 决策：**双轨**。
  1. **分块 DB storage 作兜底**（`@homurajs/storage/db`）：强制分块（即使小文件也 1 块），
     `homura_files`（清单）+ `homura_file_chunks`（数据，复合主键 object_key+chunk_index）两表；
     `data` 列是 **base64 文本不是 bytea**（PostgREST bytea 编解码不可靠，text 三方言一致、编解码自控）；
     init/putChunk/complete 协议 + 浏览器 SDK（`@homurajs/storage/chunk-client` 的 `uploadChunked`，
     每块发**原始字节** body 不 base64，把请求体压到 raw 块大小）；下载走服务端 `downloadStream`
     逐块流式重组（避免整文件进内存）；残块 GC（status=uploading 超 24h 顺带清扫）；
     **可配总上限**（缺省 50MB，非"无限"）。
  2. **预签名直传作大文件正解**（s3 后端 `getSignedUploadUrl` + 模板 `/api/files/presign` +
     客户端 `uploadViaPresign`）：浏览器拿预签名 PUT URL 直传 OSS/S3，绕开网关与 DB。
- 为什么选这个：
  - 分块是唯一能绕开"网关缓冲整个 body"的上传方式（流式无效）；base64-text 是唯一在 PostgREST 上
    往返保真的二进制编码（bytea 实测损坏）
  - 但 DB 存 blob 是反模式（撑大库、无 CDN、慢、贵），故只作**兜底**且设总上限；"无限大"是陷阱
  - 大文件的正解始终是对象存储——预签名直传让字节不过 App，既绕网关又不膨胀 DB。分块 DB 是
    "Pages 上连对象存储都不可达时"的退路
- 为什么不选其他：单请求方案撞网关限；bytea 往返损坏；流式上传绕不过网关缓冲；真"无限大"会诱导
  把 GB 级视频塞进 Postgres。
- 后果：
  - 块大小缺省 384KB raw（base64 后 512KB），实测 3MB 文件分 8 块上传成功、流式下载逐字节一致，
    而同文件整文件上传被网关 413——分块确实绕过了限制
  - base64 使 DB 体积 +33%；分块使 N 块 = N 行（下载大文件要 N 次 PostgREST 查询，流式逐块）
  - 预签名直传需对象存储侧配 CORS（允许 Pages 域名 PUT + Content-Type），且 content-type 必须与
    签发时一致（签名覆盖了它）；OSS 从 Pages/浏览器侧的出网可达性尚未实测
  - 依赖方向：storage → `@homurajs/db` schema-helpers（照 auth/license 先例，已进 AGENTS.md 白名单）；
    drizzle-orm 是 optional peer，`./db` 子路径动态 import
- 实测（2026-10-14，Pages 部署态）：512KB 整文件上传 201、768KB 报 500（base64 ~1MB 撞 PostgREST 值限）、
  ≥1MB 网关 413；分块 3MB（8×384KB）全 200 → 流式下载 3145728B 逐字节一致；超总上限 init 被拒。
- 何时重新审视：平台放开 body 上限或提供原生对象存储时；或 OSS 从 Pages 出网实测可达后，
  大文件应优先走预签名直传而非分块 DB。

## ADR-022：auth 多凭证身份模型——users 锚点 + 三类凭证 + JIT

- 日期：2026-10-14
- 状态：已采纳
- 背景：原 `@homurajs/auth` 只支持 OAuth2（Authorization Code Flow），不接钉钉就没有认证能力。
  这与"轻应用基础能力 SDK"定位不符——AI 生成的应用最常见诉求是"加个登录"，TextPassword 是
  唯一零外部依赖的认证选项。WebAuthn 作为面向未来的无密码认证是第二层需求。需要统一三类
  凭证（TextPassword 1:1 / WebAuthn 1:N / OAuth2 identity links 1:N）到一个本地身份锚点。
- 考虑过的方案：
  - **各凭证独立签发 session**：无统一 sub，跨凭证合并账户不可能 → 否
  - **IdP subject 当主键，凭证表指向它**：OAuth2-only 可行，但 TextPassword/WebAuthn 没有上游
    subject，强塞一个本地伪造的 sub 语义混乱 → 否
  - **users 表作锚点 + 三类凭证表各自引用 user_id**：统一、清晰、可扩展 → 选
  - **SDK 渲染登录页**：越权——homura 是 SDK 不是全栈框架，UI 是 App 的事 → 否（Spring Security
    那种内嵌登录页是框架的做法）
- 决策：
  1. 引入 `users` 表作为本地身份锚点，所有凭证通过 `user_id` 关联
  2. `session.sub` 从 IdP subject 改为 local user ID（**Breaking**：现有 refresh token 全部失效）
  3. 三类凭证各自一张表：`passwords`（PK = user_id，1:1）、`oauth2_identity_links`
     （UNIQUE provider+provider_sub，1:N）、`webauthn_credentials`（PK = credentialId，1:N）
  4. `createDefaultIdentityResolver(userStore, linkStore, { jit })` 在 OAuth2 callback 时
     桥接 IdP sub → local user；JIT 默认开启（首次登录自动建户），可配置关闭（403 拒绝未知身份）
  5. SDK 只提供 JSON API，不渲染任何 HTML 登录页；OAuth2 路径统一到 `/auth/oauth2/*`
     （Breaking：旧 `/auth/login` + `/auth/callback`）
  6. WebAuthn 走 `@simplewebauthn/server` optional peer dep + `./webauthn` 子路径，不用则零依赖
  7. `AuthInject` 接口不变，`createAuthRoutes` 按配置的能力（oauth2/password）自动组合路由
- 为什么选这个：
  - users 锚点是唯一能统一三类凭证且保持语义清晰的方案
  - JIT 默认开启是轻应用的标准体验（OAuth2-only App 无需预注册）
  - SDK 不渲染页面守住了"渐进式耦合"边界——App 自行决定登录 UI
- 后果：
  - Breaking change：session sub 语义变更 + OAuth2 路径迁移，所有已部署 App 需更新 redirect_uri
  - 4 张新表（users/passwords/oauth2_identity_links/webauthn_credentials）需加入部署期受控迁移
  - `createAuthRoutes` 签名变更（`client` → `oauth2: { client, identityResolver, provider }`）

## ADR-023：密码哈希选型——Node 内置 scrypt，零依赖

- 日期：2026-10-14
- 状态：已采纳
- 背景：TextPassword 需要安全的密码哈希算法。候选：bcrypt / argon2 / scrypt / PBKDF2。
- 考虑过的方案：
  - **argon2**：OWASP 推荐首选，但需要原生编译（node-gyp），qw-pages 运行时未知 → 否
  - **bcrypt**：成熟但同样需要原生编译，且 72 字节密码长度限制 → 否
  - **PBKDF2**：Node 内置，零依赖，但非内存困难（GPU 可并行爆破）→ 备选
  - **scrypt**：Node 内置 `crypto.scrypt`，零依赖，内存困难（NIST SP 800-132 认可），
    qw-pages 上 Node 运行时必定可用 → 选
- 决策：
  1. 使用 `node:crypto` 的 `scryptSync`（同步版，避免 callback 复杂性）
  2. 参数 N=16384, r=8, p=1（Node 默认，适合 2024 硬件）
  3. 哈希格式 `$scrypt$N,r,p$salt$hash`（便于未来升级算法时保留旧格式）
  4. 16 字节随机 salt，64 字节输出
  5. 验证用 `timingSafeEqual` 防时序攻击
- 为什么选这个：
  - 零原生依赖 = qw-pages 兼容（App 运行时是平台提供的 Node，无法预装 .node 文件）
  - scrypt 内存困难特性比 PBKDF2 更安全（抗 GPU/ASIC 并行）
  - `scryptSync` 简化代码（无 Promise 包装），auth 包的密码操作不在热路径
- 后果：
  - 密码哈希 CPU 成本约 50-100ms/次（可接受，非高频操作）
  - 未来如需升级算法（如 argon2id），通过解析格式字符串的前缀 `$scrypt$` 平滑迁移
  - 不引入 `@node-rs/bcrypt` 等替代方案，保持依赖最小化

## ADR-024：根 package.json 为唯一版本权威，子包版本派生

- 日期：2026-10-19
- 状态：已采纳
- 背景：`@homurajs/*` 七个包历史上用同一 CalVer 号一起发版（`chore(release): 全包版本号 X → Y`），
  但版本号要在 8 个 `package.json` 里各写一遍。两个真实问题：
  - **手工同步易漏**：改根版本忘了改子包（或反之），发出去的包版本与仓库声明不符；
    `release.yml` 原本读 `packages/core/package.json` 判断"npm 上有没有这个版本"，
    等于把 core 当事实权威，与"根版本"的心智不一致，一旦 core 漏改就会静默跳过发布
  - **无门禁**：漂移不会被任何测试或 CI 步骤发现，直到发布产物版本错乱
- 考虑过的方案：
  - **删掉子包 version 字段**：最彻底，但 pnpm publish 硬性要求该字段，
    实测缺失即 `ERR_PNPM_PACKAGE_VERSION_NOT_FOUND`（"Package version is not defined in the package.json"）→ 否
  - **pnpm catalog / workspace 协议注入**：catalog 管的是依赖版本，不是包自身版本；
    `workspace:*` 只解析依赖引用，不写入被引用包的 version → 不适用
  - **发布期动态注入**（CI 里改 package.json 再 publish）：能工作，但仓库里的 package.json 与
    npm 上的实际版本长期不一致，本地 `npm pack` / dry-run / 类型工具看到的都是假版本，
    排障成本高 → 否
  - **根为权威 + 脚本派生 + 门禁校验**：子包 version 仍是真实字段（工具链可读），
    但由脚本从根单向同步，且 CI 拒绝漂移 → 选
- 决策：
  1. 根 `package.json` 的 `version` 是唯一权威；改版本**只改这一处**
  2. `scripts/sync-version.mjs` 把根版本单向写入 `packages/*` 里非 private 的 `@homurajs/*` 包
     （private 的 `template-hono-react` / `homura-docs` 不发布，不动）
  3. 脚本用正则原地替换 `"version"` 值，不走 `JSON.stringify` 重写整个文件，
     以免打乱字段顺序、产生无关 diff
  4. `sync-version.mjs --check` 作为门禁接入 `test.yml`（PR 阶段就暴露漂移）与
     `release.yml`（发版前最后一道，漂移直接拒绝发布）
  5. `release.yml` 的 CalVer 校验与"npm 是否已有该版本"判断改为读**根** `package.json`；
     且发布完整性检查改为**逐包**——只查 core 会漏掉"部分发布"状态（core 发出去了、
     storage 没发出去），之后每次 push 都判定"已存在"而跳过，缺的包永久停在旧版本
  6. CalVer 格式校验（`YY.MM.DD`）收进 `sync-version.mjs`，与 release.yml 的门禁同源
- 为什么选这个：
  - 单一权威 = 不会漂移；门禁 = 漂移了也发不出去
  - 子包保留真实 version 字段，工具链（`npm pack` / dry-run / IDE）看到的版本是真的
  - lockfile 用 `link:../core` 记录 workspace 依赖、不含版本号，故改版本不会让
    `pnpm install --frozen-lockfile` 失效（已实测），CI 无需重新解析依赖
- 后果：
  - 发版流程：改根 `package.json` 的 version → `node scripts/sync-version.mjs` → 提交
    （8 个文件各一行 version 变更）
  - 所有 `@homurajs/*` 包永远同版本发布，无法单独发某个包的补丁版本；
    对本仓库是可接受的——七包本就一起演进、一起发版
  - 手工编辑子包 version 会在 CI 被拦下（这正是目的）
- 何时重新审视：需要各包独立语义化版本（semver）时——届时应改用 changesets 一类工具，
  而非退回手工多文件维护

## ADR-025：移除 PostgREST（rest 方言）与 qw-pages 部署形态，收敛为 standalone
- **日期**：2026-10-28
- **状态**：已采纳（本次提交执行完毕）
- **背景**：框架早期同时支持「standalone（node:sqlite / pg）」与「qw-pages 托管（PostgREST）」双形态。
  qw-pages 形态把大量平台特异性（只读根目录、12 个固定 env 无注入口、/healthz 归网关、
  body 上限、DDL 权限缺失、桶建不出）倒灌进了所有能力包：db 的 PostgREST 层与 rest-schema 派生、
  storage 的 DB 分块后端（homura_files/homura_file_chunks）+ chunk-client、auth 的 5 个 rest store、
  license 的 rest state store、app-kit 的 qw-pages adapter 与 healthzPathFor 形态探测、
  core 的 detectRuntime/QWENWORK_WRITABLE_DIR、模板的双形态构建与建表 runbook。
  实际消费方（guga-onduty 等）全部走 standalone + OIDC IdP 拓扑；qw-pages 形态无真实长期消费方。
- **决策**：整刀切掉 rest/qw-pages 全链：
  - `db`：删 postgrest.ts / rest-schema / rest-ttlkv（createRestDb/RestDb/restSchemaFromPg/createRestTtlKv）
  - `storage`：删 db 后端（./db ./tables ./chunk-client 子路径）、ChunkedFileStorage/FileManifest、downloadStream
  - `auth`：删 5 个 rest store（session/user/oauth2-link/password/webauthn-credential）
  - `license`：删 rest state store
  - `app-kit`：删 qw-pages adapter（./qw-pages 子路径）、createApp 的 runtime 选项与 detectRuntime 透传；healthz 固定 core HEALTHZ_PATH
  - `core`：删 runtime.ts（detectRuntime/RuntimeTarget/healthzPathFor），新增 healthz.ts（HEALTHZ_PATH 常量）；env-file 剥离 QWENWORK_WRITABLE_DIR 候选
  - 模板：单形态构建（build.mjs）、schema 只剩 pg/sqlite 两份、db.ts/env.ts/app.ts 去分支、删 qw-pages.ts 与 schema/rest.ts
  - 文档：删 specs/module-qw-pages.md，AGENTS/README/ARCHITECTURE/PRD 各 spec 同步改写
- **理由**：① 形态探测/分块/探活/派生 schema 等复杂度的存在理由是平台限制，平台没了复杂度就是纯负债；
  ② 真实部署全在自有服务器，PostgREST 一次都没在生产跑过业务数据；
  ③ 登录的钉钉细节已收敛到独立 IdP（oauth2-dingtalk，见 ADR-7 @guga-onduty），框架不再需要为受限环境做对冲。
- **后果**： breaking change——依赖 rest 轨的旧 App（如 guga-onduty-w）须钉在 26.10.x 旧版；
  exports/entry 收敛后 check-package-exports 门禁同步生效。历史教训保留（exports 漏发、原子抢占语义等）。
- **何时重新审视**：若再出现「只有 443 出网 + 无自定义 env」的托管形态，重新评估——但应先做平台侧
  能力补齐（env 注入、DDL、健康检查路径），而不是再让框架倒灌。
