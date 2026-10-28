# @homurajs/auth

多凭证身份认证：OIDC 客户端（id_token 验签 + sub 交叉核对）+ TextPassword（scrypt）+ WebAuthn（可选）+ 自管 session（HS256 短 JWT + opaque refresh rotate + 族吊销）。

## 架构

**身份模型（ADR-022）**：`users` 表是本地身份锚点，三种凭证都通过 `user_id` 关联：

- `passwords`：1:1 users，scrypt 哈希（Node 内置 crypto，零依赖，ADR-023）
- `oauth2_identity_links`：1:N users，UNIQUE(provider, provider_sub)
- `webauthn_credentials`：1:N users，PK = credentialId base64url

**session.sub = local user ID**（Breaking：不再是 IdP subject）。Identity Resolver 在 OIDC callback 时桥接 IdP sub → local user，JIT 默认开启（首次登录自动建户），可配 false 拒绝未知身份。

**目录白名单 JIT（ADR-026）**：`identity_directory` 是泛型的外部身份目录（provider+sub+name，App 把上游来源如钉钉通讯录快照进来）。`createDirectoryProvisioningResolver` 提供准入骨架——查 link → 查目录（白名单）→ 调 App 的 `provision(sub, entry)` 回调拿建户决策 → 建 link；目录外身份一律 `ProvisionBlockedError` 拒绝。**建户策略（默认角色、校区、允许性）留在 App 回调，永不下沉。**

**SDK 不渲染 HTML**：所有路由只返回 JSON + cookies，登录 UI 由 App 自行实现。

## 存储实现

所有 store 都有双版本，接口语义严格对齐，按数据方言选：

| 实现                                | 用于               | 说明                                                                                                            |
| ----------------------------------- | ------------------ | --------------------------------------------------------------------------------------------------------------- |
| `createDrizzleSessionStore(db)`     | `sqlite` / `pg`    | 原生 SQL，`UPDATE...WHERE used_at IS NULL RETURNING` 做原子抢占                                                 |
| `createDrizzleUserStore(db)`        | `sqlite` / `pg`    | users 表 CRUD                                                                                                   |
| `createDrizzleOAuth2LinkStore(db)`  | `sqlite` / `pg`    | oauth2_identity_links 表 CRUD                                                                                   |
| `createDrizzlePasswordStore(db)`    | `sqlite` / `pg`    | passwords 表 CRUD                                                                                               |
| `createDrizzleWebauthnCredentialStore(db)` | `sqlite` / `pg` | webauthn_credentials 表 CRUD                                                                                |
| `createDrizzleDirectoryStore(db)`   | `sqlite` / `pg`    | identity_directory 表 CRUD（upsert 快照语义）                                                                   |

## 使用示例

### OIDC + Identity Resolver

```ts
import { dingtalkOidc } from '@homurajs/3p/dingtalk'
import {
  OidcClient,
  SessionManager,
  createDrizzleSessionStore,
  createDrizzleUserStore,
  createDrizzleOAuth2LinkStore,
  createDefaultIdentityResolver,
  createMemoryTtlKv,
} from '@homurajs/auth'
import { createAuthRoutes, sessionMiddleware } from '@homurajs/auth/hono'

const preset = dingtalkOidc({ orgId: 'my_org' }) // 含 issuer + 三端点
const client = new OidcClient({
  clientId: '...',
  clientSecret: '...', // 兼作 id_token HS256 验签密钥
  redirectUri: 'https://app.example/auth/oidc/callback',
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
  oidc: { client, identityResolver, provider: 'dingtalk' },
}))
```

客户端在 callback 内强制：token 响应的 `id_token`（HS256）验签（iss/aud/exp）→ userinfo 的 sub 与 id_token 的 sub 交叉核对 → 才交给 resolver。协议失败统一 `OidcError`（code 封闭枚举），hono 路由映射 401 `{ error: 'oidc_failed', code }`。

### 目录白名单 JIT（Directory Provisioning）

```ts
import {
  createDrizzleDirectoryStore,
  createDirectoryProvisioningResolver,
  ProvisionBlockedError,
} from '@homurajs/auth'

const directory = createDrizzleDirectoryStore(db) // App 定期把钉钉通讯录 upsert 进来
const identityResolver = createDirectoryProvisioningResolver({
  userStore,
  linkStore,
  directory,
  // 建户策略是 App 的信任边界：谁允许进来、默认角色/校区，都在这里决定
  async provision({ sub, entry }) {
    const existing = await appUsers.findByUsername(sub)
    if (existing) return { userId: existing.id }
    if (!entry.name) return { declined: '通讯录条目缺少姓名' }
    const created = await appUsers.create({ username: sub, nickname: entry.name })
    return { userId: created.id }
  },
})

// hono callback 路由会把 ProvisionBlockedError 映射为 403 JSON：
// { error: 'provision_blocked', reason: 'not_in_directory' | 'declined' | 'unknown_user', ... }
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

- `@homurajs/auth`：核心（OidcClient, SessionManager, PasswordProvider, IdentityResolver, 各 store 工厂）
- `@homurajs/auth/hono`：Hono 路由（createAuthRoutes, createPasswordRoutes, sessionMiddleware, requireAuth）
- `@homurajs/auth/tables`：表定义（pgAuthTables, sqliteAuthTables，含 6 张表）
- `@homurajs/auth/webauthn`：WebAuthn（WebAuthProvider, createWebAuthnRoutes, credential store 工厂）

## 注意事项

**`secure` 必须按部署传**：平台网关后对外是 https 时 `secure` 应为 `true`，否则 cookie 不带 `Secure`。

**Breaking（2026-10-28，OIDC 化）**：
- `OAuth2Client` → `OidcClient`：token 响应必须含 `id_token`（HS256，密钥=clientSecret），强制验签（iss/aud/exp）+ userinfo.sub 交叉核对；配置新增 `issuer`
- 路径从 `/auth/oauth2/*` 迁移到 `/auth/oidc/*`；`requireAuth` 缺省 loginPath 同步
- `createAuthRoutes` 签名变更：`oauth2: {...}` → `oidc: { client, identityResolver, provider }`
- 协议失败统一 `OidcError`（原裸 Error）

**Breaking（2026-10-14）**：
- session.sub 从 IdP subject 改为 local user ID（现有 refresh token 全部失效，重登即恢复）
- OAuth2 路径从 `/auth/login` + `/auth/callback` 迁移到 `/auth/oauth2/*`
- `createAuthRoutes` 签名变更：`client` → `oauth2: { client, identityResolver, provider }`

`consume` 的原子抢占语义已在真实数据库上验证。详见 `docs/specs/module-oidc`、`module-session`、`module-password`、`module-webauthn`、ADR-022、ADR-023、ADR-026。使用示范见模板 `src/server/app.ts`（buildAuth）。
