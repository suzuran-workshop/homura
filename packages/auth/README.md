# @homura/auth

认证：通用标准 OAuth2 (Authorization Code Flow) 客户端 + 自管 session（HS256 短 JWT + opaque refresh rotate + 族吊销）。

```ts
// OAuth 预设来自 @homura/3p（结构化契约，鸭子类型互操作）
import { dingtalkOAuth } from '@homura/3p/dingtalk'
import { OAuth2Client, SessionManager } from '@homura/auth'
import { createMemoryTtlKv } from '@homura/core'

const preset = dingtalkOAuth({ orgId: 'my_org' }) // 对接 ../oauth2-dingtalk
const client = new OAuth2Client({
  clientId: '...', clientSecret: '...', redirectUri: 'https://app.example/auth/callback',
  stateKv: createMemoryTtlKv(), // 多实例部署换 createDbTtlKv
  ...preset,                    // endpoints + mapUser
})

const sessions = new SessionManager(
  { secret: SESSION_SECRET /*>=32B*/, accessTokenTtlSec: 7200, refreshTokenTtlSec: 30*24*3600 },
  createDrizzleSessionStore(db),
)

// Hono 集成
import { createAuthRoutes, sessionMiddleware, requireAuth } from '@homura/auth/hono'
app.use('*', sessionMiddleware(sessions))
app.route('/', createAuthRoutes({ client, sessions }))
app.use('/api/*', requireAuth)
app.get('/api/me', (c) => c.json(c.get('auth')))
```

上游契约与 state 语义见 `docs/specs/module-oauth2`；session 状态机见 `module-session`。使用示范见模板 `src/server/app.ts`（buildAuth）与 `src/server/routes/api.ts`（c.get('auth')）。
