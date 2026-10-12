# Suzuran 遗产档案（homura 重生前考古记录）

> 旧仓库：`git show archive/suzuran-final:<path>` 取阅。本档案沉淀已被 homura 吸收或明确抛弃的经验。

## 已吸收

| 遗产 | 去向 |
|------|------|
| 存储适配器六方法 + org 前缀 key 隔离 + 代理 URL + presign 降级 + 工厂分发 | @homura/storage（接口平移，ns 语义化） |
| 钉钉新版 OAuth 三端点流程与 state TTL-KV 一次性消费 | 归 ../oauth2-dingtalk（服务端）；homura 只留客户端语义 |
| 企业 access_token 无缓存的债（oapi gettoken 每次重取） | @homura/3p/dingtalk CorpTokenManager（7200s 缓存+提前刷新+single-flight） |
| JWT + 不透明 refresh（SHA-256 入库、rotate）模式 | @homura/auth SessionManager（升级为 familyId 复用检测族吊销） |
| TTL-KV 双通道（Redis 可用则用，否则进程内 map） | @homura/core createMemoryTtlKv + @homura/db createDbTtlKv（去 Redis） |
| app.json 清单（name/version/runtime/entrypoint/routes）+ SemVer 契约思想 | homura.manifest.json（qw-pages 产物） |
| Vite dev proxy 约定前缀（前端零 CORS）+ 三 tsconfig 拆分 | templates/hono-react |
| 多 IdP provider 抽象接口签名（OAuthProvider interface） | @homura/3p 能力分片（更彻底的 capability 协商） |

## 明确抛弃

| 旧物 | 理由 |
|------|------|
| 多租户 org/bond/dept 模型与登录选组织流程 | homura 的 App 是单租户轻应用 |
| Go 三层架构（handler/service/repository） | 换 TypeScript/Hono 栈 |
| 自建 OAuth IdP（WebAuthn/密码/授权服务器） | 登录归 oauth2-dingtalk |
| MCP Server 数据共享层（64 tools） | 无平台语境 |
| 平台托管容器沙箱 + zip 应用导入 | 部署归 qw-pages / 独立 Node |
| 「无 Redis 就放行 state」的 dev 后门 | 改为显式 allowNoState opt-in |
| SDK 零依赖决策（2026-08-04） | 无中间件/文件上传代价过高；以 peer+动态 import 控制耦合面 |

## 教训存档

1. 低代码 DSL 有天花板，Agent 代码无上限（2026-08-02 转型决策核心逻辑，homura 延续）
2. 抽象层「设计好但不接线」等于没有（ProviderRegistry 从未实例化）——homura 的 3p 抽象必须被 dingtalk 实现真正跑通
3. 角色体系越简单越好（tenant_admin/dept_manager 废除史）——homura 直接单租户
4. token 15 分钟过期无刷新是最大运行时债务——session 设计的第一优先级

## 轮二实现教训（homura 自身，非 Suzuran 遗产）

> 这些是 homura 建设过程中真实踩到的坑，印证了上面的遗产教训。

5. **契约必须实读源码核对，不能信侦察摘要**（印证教训 2）：侦察兵报告 oauth2-dingtalk 的
   userinfo 返回 `{openId,nick,avatarUrl}`，实读源码才发现服务端对外返回的是标准 OIDC
   `{sub,name,email,picture}`（内部映射过）。若照摘要写 mapUser，运行时必抛「缺 sub」。
   → 计划里「2.2 步强制实读 ../oauth2-dingtalk」这条纪律直接避免了一个线上 bug。
6. **走原生 SQL 的表，列名必须显式声明**（新坑）：drizzle 配方默认用 JS 属性名（camelCase）
   做 DB 列名，但 auth/license 的 store 走原生 SQL 用 snake_case → 迁移生成的 DDL 与 store
   查询列名不匹配，运行时崩。parity 测试测不出（两侧都 camelCase 自然一致）。
   → 靠「模板真实跑 drizzle-kit generate 并检查 DDL」发现。教训：集成测试要覆盖真实迁移产物，
     不能只测单元测试层的 schema 对象。详见 specs/module-schema 的列名规则。
7. **源码直出的 workspace 包，打包时必须 noExternal**（新坑）：`@homura/*` 的 exports 指向
   `src/*.ts`，tsdown 默认 external 化后，`node dist/server/index.mjs` 运行时会去 import `.ts`
   直接崩。→ 两个形态都必须 `noExternal: [/^@homura\//]`（qw-pages 更是全打包）。
   教训：「内部包不预编译」的决策（ADR-004）把打包责任推给了消费方 build，必须在模板
   build 脚本里显式处理，且靠「实测 node 跑产物」兜底（不能只 typecheck）。
8. **UPDATE...RETURNING 返回更新后的值，不能用它判「更新前状态」**（新坑）：session refresh
   的复用检出最初想用 `RETURNING used_at` 事后判断是否已被消费，但 RETURNING 给的是本次
   刚写入的 ts，恒等于「未消费」→ 复用永远检不出。→ 改为「原子抢占（WHERE used_at IS NULL）
   成功与否」区分首次消费与复用。教训：数据库「先占后判」优于「先改后读」。
9. **测试桩要模拟真实的调用形态**：license e2e 最初靠「等心跳循环 setTimeout」触发 suspended，
   flaky。→ 改为 fake genuine 在 register 就返回 suspended（合法场景），getStatus() 在 await
   onStart() 后即为确定态。教训：能用确定的初始态，就别依赖异步时序。
