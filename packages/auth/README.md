# @homurajs/auth

多凭证身份认证：OAuth2 客户端 + TextPassword（scrypt）+ WebAuthn（可选）+ 自管 session（HS256 短 JWT + opaque refresh rotate + 族吊销）。

## 架构

**身份模型（ADR-022）**：`users` 表是本地身份锚点，三种凭证都通过 `user_id` 关联：

- `passwords`：1:1 users，scrypt 哈希（Node 内置 crypto，零依赖，ADR-023）
- `oauth2_identity_links`：1:N users，UNIQUE(provider, provider_sub)
- `webauthn_credentials`：1:N users，PK = credentialId base64url

**session.sub = local user ID**（Breaking：不再是 IdP subject）。Identity Resolver 在 OAuth2 callback 时桥接 IdP sub → local user，JIT 默认开启（首次登录自动建户），可配 false 拒绝未知身份。

**SDK 不渲染 HTML**：所有路由只返回 JSON + cookies，登录 UI 由 App 自行实现。

## 存储实现

所有 store 都有双版本，接口语义严格对齐，按数据方言选：

| 实现                                | 用于               | 说明                                                                                                            |
| ----------------------------------- | ------------------ | --------------------------------------------------------------------------------------------------------------- |
| `createDrizzleSessionStore(db)`     | `sqlite` / `pg`    | 原生 SQL，`UPDATE...WHERE used_at IS NULL RETURNING` 做原子抢占                                                 |
| `createRestSessionStore(rest)`      | `rest`（qw-pages） | PostgREST：`PATCH ?token_hash=eq&expires_at=gt&used_at=is.null` + `return=representation`，返回空数组即抢占失败 |
| `createDrizzleUserStore(db)`        | `sqlite` / `pg`    | users 表 CRUD                                                                                                   |
| `createRestUserStore(rest)`         | `rest`             | PostgREST                                                                                                       |
| `createDrizzleOAuth2LinkStore(db)`  | `sqlite` / `pg`    | oauth2_identity_links 表 CRUD                                                                                   |
| `createRestOAuth2LinkStore(rest)`   | `rest`             | PostgREST                                                                                                       |
| `createDrizzlePasswordStore(db)`    | `sqlite` / `pg`    | passwords 表 CRUD                                                                                               |
| `createRestPasswordStore(rest)`     | `rest`             | PostgREST                                                                                                       |
| `createDrizzleWebauthnCredentialStore(db)` | `sqlite` / `pg` | webauthn_credentials 表 CRUD                                                                                |
| `createRestWebauthnCredentialStore(rest)`  | `rest`          | PostgREST                                                                                                       |

## 使用示例

### OAuth2 + Identity Resolver

```ts
import { dingtalkOAuth } from '@homurajs/3p/dingtalk'
import {
  OAuth2Client,
  SessionManager,
  createDrizzleSessionStore,
  createDrizzleUserStore,
  createDrizzleOAuth2LinkStore,
  createDefaultIdentityResolver,
  createMemoryTtlKv,
} from '@homurajs/auth'
import { createAuthRoutes, sessionMiddleware } from '@homurajs/auth/hono'

const preset = dingtalkOAuth({ orgId: 'my_org' })
const client = new OAuth2Client({
  clientId: '...',
  clientSecret: '...',
  redirectUri: 'https://app.example/auth/oauth2/callback',
  stateKv: createMemoryTtlKv(),
  ...preset,
})

const userStore = createDrizzleUserStore(db)
const linkStore = createDrizzleOAuth2LinkStore(db)
const identityResolver = createDefaultIdentityResolver(userStore, linkStore, { jit: true })

const sessions = new SessionManager({ secret: SESSION_SECRET }, createDrizzleSessionStore(db))

app.use('*', sessionMiddleware(sessions, { secure }))
app.route('/', createAuthRoutes({
  sessions,
  oauth2: { client, identityResolver, provider: 'dingtalk' },
}))
```

### TextPassword

```ts
import { PasswordProvider, createDrizzlePasswordStore } from '@homurajs/auth'

const passwordProvider = new PasswordProvider({
  userStore,
  passwordStore: createDrizzlePasswordStore(db),
})

app.route('/', createAuthRoutes({
  sessions,
  password: passwordProvider,
  allowRegister: true, // 默认 true，可配 false 禁止自助注册
}))
```

路由：
- `POST /auth/password/register` → session cookies + 200 JSON
- `POST /auth/password/login` → session cookies + 200 JSON
- `POST /auth/password/change` → 需已登录 → 200 JSON
- `POST /auth/password/delete` → 需已登录 → 200 JSON

### WebAuthn（可选）

```ts
import { WebAuthProvider, createDrizzleWebauthnCredentialStore } from '@homurajs/auth/webauthn'
import { createWebAuthnRoutes } from '@homurajs/auth/webauthn'

const webauthn = new WebAuthProvider({
  rpName: 'My App',
  rpID: 'app.example.com',
  origin: 'https://app.example.com',
  userStore,
  credentialStore: createDrizzleWebauthnCredentialStore(db),
  challengeKv: createMemoryTtlKv(),
})

app.route('/', createWebAuthnRoutes({ webauthn, sessions }))
```

`@simplewebauthn/server` 是 optional peer dep，不用 WebAuthn 的 App 无需安装。

## 子路径导出

- `@homurajs/auth`：核心（OAuth2Client, SessionManager, PasswordProvider, IdentityResolver, 各 store 工厂）
- `@homurajs/auth/hono`：Hono 路由（createAuthRoutes, createPasswordRoutes, sessionMiddleware, requireAuth）
- `@homurajs/auth/tables`：表定义（pgAuthTables, sqliteAuthTables，含 5 张表）
- `@homurajs/auth/webauthn`：WebAuthn（WebAuthProvider, createWebAuthnRoutes, credential store 工厂）

## 注意事项

**`secure` 必须按形态传**：qw-pages 在平台网关后、对外是 https，`secure` 应为 `true`，否则 cookie 不带 `Secure`。模板里由 `adapter.trustProxy()` 接线。

**qw-pages 前置条件**：所有 auth 表（users / passwords / oauth2_identity_links / webauthn_credentials / refresh_tokens）与 anon RLS policy 必须在部署期用平台受控迁移建好（App 无 DDL 权限）。缺 policy 时 PostgREST 是静默失败。

**Breaking（2026-10-14）**：
- session.sub 从 IdP subject 改为 local user ID（现有 refresh token 全部失效，重登即恢复）
- OAuth2 路径从 `/auth/login` + `/auth/callback` 迁移到 `/auth/oauth2/authorize` + `/auth/oauth2/callback`
- `createAuthRoutes` 签名变更：`client` → `oauth2: { client, identityResolver, provider }`

`consume` 的原子抢占语义已在真实 PostgREST 上验证。详见 `docs/specs/module-oauth2`、`module-session`、`module-password`、`module-webauthn`、ADR-022、ADR-023。使用示范见模板 `src/server/app.ts`（buildAuth）。
