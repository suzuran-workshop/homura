# @homurajs/auth

认证：通用标准 OAuth2 (Authorization Code Flow) 客户端 + 自管 session（HS256 短 JWT + opaque refresh rotate + 族吊销）。

session store 有两版实现，接口语义严格对齐，按数据方言选：

| 实现                            | 用于               | 说明                                                                                                            |
| ------------------------------- | ------------------ | --------------------------------------------------------------------------------------------------------------- |
| `createDrizzleSessionStore(db)` | `sqlite` / `pg`    | 原生 SQL，`UPDATE...WHERE used_at IS NULL RETURNING` 做原子抢占                                                 |
| `createRestSessionStore(rest)`  | `rest`（qw-pages） | PostgREST：`PATCH ?token_hash=eq&expires_at=gt&used_at=is.null` + `return=representation`，返回空数组即抢占失败 |

```ts
// OAuth 预设来自 @homurajs/3p（结构化契约，鸭子类型互操作）
import { dingtalkOAuth } from '@homurajs/3p/dingtalk'
import {
  OAuth2Client,
  SessionManager,
  createDrizzleSessionStore,
  createRestSessionStore,
} from '@homurajs/auth'
import { createMemoryTtlKv } from '@homurajs/core'

const preset = dingtalkOAuth({ orgId: 'my_org' }) // 对接 ../oauth2-dingtalk
const client = new OAuth2Client({
  clientId: '...',
  clientSecret: '...',
  redirectUri: 'https://app.example/auth/callback',
  stateKv: createMemoryTtlKv(), // SQL 单机够用；多实例换 createDbTtlKv；qw-pages 换 createRestTtlKv
  ...preset, // endpoints + mapUser
})

const store = isRest
  ? createRestSessionStore(rest) // qw-pages
  : createDrizzleSessionStore(db) // standalone
const sessions = new SessionManager(
  { secret: SESSION_SECRET /*>=32B*/, accessTokenTtlSec: 7200, refreshTokenTtlSec: 30 * 24 * 3600 },
  store,
)

// Hono 集成
import { createAuthRoutes, sessionMiddleware, requireAuth } from '@homurajs/auth/hono'
app.use('*', sessionMiddleware(sessions, { secure }))
app.route('/', createAuthRoutes({ client, sessions, secure }))
app.use('/api/*', requireAuth)
app.get('/api/me', (c) => c.json(c.get('auth')))
```

**`secure` 必须按形态传**：qw-pages 在平台网关后、对外是 https，`secure` 应为 `true`，否则 cookie 不带 `Secure`。模板里由 `adapter.trustProxy()` 接线（standalone 由 `TRUST_PROXY=1` 控制）。

**qw-pages 上的两个前置条件**：

1. `refresh_tokens` 表与 anon RLS policy 必须在部署期用平台受控迁移建好（App 无 DDL 权限）。缺 policy 时 PostgREST 是静默失败——`SELECT` 返回 `200 []`、`INSERT` 返回 401 + `42501`。
2. `SESSION_SECRET` 不能用仓库里的公开缺省值（模板 `loadConfig` 会在 Pages/生产形态下直接拒绝启动）。密钥经 `config/homura.config.env` 随产物携带——实测产物不可被公网读取。

`consume` 的原子抢占语义已在真实 PostgREST 上验证：三路并发抢占恰好一个赢家、过期 token 不会被误报为复用、族吊销只命中未消费行。

上游契约与 state 语义见 `docs/specs/module-oauth2`；session 状态机见 `module-session`。使用示范见模板 `src/server/app.ts`（buildAuth）与 `src/server/routes/api.ts`（`c.get('auth')`）。
