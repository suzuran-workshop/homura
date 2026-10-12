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
- 后果：rc 期间 API 动荡风险 → 升级只走独立 PR，必跑 parity + 迁移往返测试；drizzle import 收敛 @homura/db 缩小波及面
- 何时重新审视：drizzle 1.0 正式发布时

## ADR-003：双方言双文件 + 配方 + parity 测试，而非运行时包装器
- 日期：2026-10-13
- 状态：已采纳
- 背景：drizzle pg-core/sqlite-core 必须分别声明 schema
- 考虑过的方案：运行时包装器统一 API / colocated 双文件
- 决策：App 写 colocated `schema/pg.ts` + `schema/sqlite.ts`；@homura/db 提供 pgCol/sqliteCol 列配方与 pgJson/sqliteJson 压重复；assertSchemaParity 测试硬门禁（表名/列名/主键，含列级 primary 标记）
- 为什么不选包装器：与 drizzle 泛型系统打架，类型推导损失大
- 后果：特性限双方言共有子集；差异映射文档化（specs/module-schema）
- 何时重新审视：drizzle 1.0 若提供单 schema 双方言生成

## ADR-004：内部包源码直出 + 派生式消费（v1 不发 npm）
- 日期：2026-10-13
- 状态：已采纳
- 背景：App 全部 AI 开发、上传的是 dist bundle，无需公共分发
- 决策：exports 直指 src/index.ts（不预编译）；App 消费方式 = 派生本仓库（workspace 引用），模板 build 时整体打包
- 后果：省去 7 包 × 双格式构建维护；未来发 npm 需补 build 链
- 何时重新审视：出现外部消费者或 App 数量爆炸时

## ADR-005：渐进式耦合为全项目最高设计原则
- 日期：2026-10-13
- 状态：已采纳
- 背景：App 形态多样（纯展示→全家桶），强制依赖造成负担
- 决策：零注入也能跑（纯 routes）；app-kit 只依赖 hono+core，能力实例由 App 构造后传入；可选重依赖走 peer optional + 动态 import（s3 的 AWS SDK）+ 子路径拆分（db/pg、3p/dingtalk、storage/*）
- 后果：sqlite-only App 零 postgres 依赖；不用钉钉的 App 零钉钉代码进 bundle
- 何时重新审视：无需（结构性原则）

## ADR-006：@homura/3p 第三方平台能力分片抽象
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
- 状态：已采纳
- 背景：守卫不应让 App 因授权服务器故障而宕机；但制作人需要即时停服权
- 决策：心跳失败走宽限期（server 下发 graceSec），期内继续服务；server 明示 suspended 立即 503（即时停服权保留）；/healthz 与 /auth/* 豁免；strict 模式可选（未注册即停）
- 何时重新审视：genuine 上线后按运营经验调参

## ADR-012：qw-pages 适配集中 RuntimeAdapter + 三导出对冲 + 自包含 bundle + manifest
- 日期：2026-10-13
- 状态：已采纳
- 背景：qw-pages 入口约定未知（Node 版本/导出形态/是否装依赖/静态服务方）
- 决策：跨形态差异全走 RuntimeAdapter；qw-pages.ts 同时导出 default/fetch/app 三形态；构建为自包含单文件（不赌 qw-pages 侧 npm install）；产物附 homura.manifest.json（name/version/runtime/entrypoint/assets）；specs/module-qw-pages 维护待确认清单
- 后果：约定确认后只改 qw-pages.ts + build.mjs 两个文件
- 何时重新审视：每确认一项 qw-pages 约定

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
