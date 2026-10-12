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
