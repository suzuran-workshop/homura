# Spec — WebAuthn 认证（@homurajs/auth/webauthn）

## 要构建什么

- 目标：基于 WebAuthn/Passkey 的无密码认证，作为 OAuth2/TextPassword 的补充
- 依赖：`@simplewebauthn/server` ^11 作为 **optional peer dep**，动态 import
- 子路径：`@homurajs/auth/webauthn`（独立入口，不用 WebAuthn 的 App 零依赖零负担）

## 行为

### 注册 ceremony（已登录用户添加凭证）

1. `POST /auth/webauthn/register/options` → 需已登录
   - 调用 `generateRegistrationOptions`（rpName/rpID/userID/userName/excludeCredentials）
   - challenge 存入 TtlKv（key = `${userId}:register`，TTL 5min）
   - 返回 options JSON（客户端传给 `startRegistration`）
2. `POST /auth/webauthn/register/verify` → 需已登录
   - challenge 一次性消费（TtlKv.take）
   - 调用 `verifyRegistrationResponse` 验证 attestation
   - 提取 credential（id/publicKey/counter/deviceType/backedUp）→ 存入 webauthn_credentials 表

### 认证 ceremony（未登录用户登录）

1. `POST /auth/webauthn/auth/options`
   - 可选传入 userId（缩小 allowCredentials 范围）
   - 调用 `generateAuthenticationOptions`，返回 `{ options, challengeKey }`
   - challenge 存入 TtlKv：已知 userId 时 key = `${userId}:auth`；匿名（discoverable credential）时 key = `anon:${random}`
   - 响应 = options JSON **附带 `challengeKey`**（客户端传给 `startAuthentication`，并需在 verify 时回传 challengeKey）
2. `POST /auth/webauthn/auth/verify`
   - body 含 `response` + 可选 `challengeKey`
   - 按 credentialId（response.id）查凭证 → 找 user
   - 消费 challenge：key = 回传的 `challengeKey`，缺省回退 `${cred.userId}:auth`
   - 调用 `verifyAuthenticationResponse` 验证 assertion → 更新 counter（防重放）→ 创建 session → cookies + 200 JSON

> ⚠ **challengeKey 必须回传（匿名流程）**：匿名 options 阶段还不知道是哪个用户/凭证，challenge 只能存在 `anon:${random}` 下；而 verify 阶段是按 `response.id` 反查凭证的，两条腿对不上同一个固定 key。故 `generateAuthenticationOptions` 把 `challengeKey` 一并返回，客户端在 verify 时回传。已知 userId 的流程 key 固定为 `${userId}:auth`，回传与否都能命中（向后兼容）。
> 历史 bug：旧实现匿名 challenge 存 `anon:xxx` 但 verify 只按 `${cred.userId}:auth` 取、且 API 不接受 key 回传 → discoverable credential 登录永远失败（provider.test.ts 已锁这条契约）。

### 凭证管理

- `GET /auth/webauthn/credentials` → 已登录用户列出所有凭证
- `POST /auth/webauthn/credentials/delete` → 已登录用户删除指定凭证（只能删自己的）

## 存储

- `webauthn_credentials` 表（PK = credentialId base64url，1:N users）
- 列名显式 snake_case：id / user_id / public_key / counter / device_type / backed_up / transports / display_name / created_at

## 配置

- `AUTH_WEBAUTHN_ENABLED`（默认 false）
- `AUTH_WEBAUTHN_RP_ID`（域名，如 app.example.com）
- `AUTH_WEBAUTHN_RP_NAME`（显示名，如 "My App"）
- `AUTH_WEBAUTHN_ORIGIN`（允许的 origin，如 https://app.example.com；多 origin 逗号分隔）

> 模板接线（templates/hono-react `buildAuth`）：`AUTH_WEBAUTHN_ENABLED=true` 且配齐 `RP_ID`/`ORIGIN` 时，构造 `WebAuthProvider`（challenge 复用 OAuth2 state 的 TtlKv）并把 `createWebAuthnRoutes` 挂进 authRoutes；缺 RP_ID/ORIGIN 则告警且不挂载。此前该开关只决定建不建表、路由从不挂载（死配置），现已接通服务端。客户端 passkey UI 仍由 App 自绘（SDK 只给 JSON 路由）。

## 依赖策略

- `@simplewebauthn/server` ^11 是 optional peer dep
- 动态 import 在 `provider.ts` 内部（`await import('@simplewebauthn/server')`）
- `@simplewebauthn/browser` 由 App 前端直接安装（SDK 不管客户端）
- `AuthenticatorTransportFuture` 类型本地定义（避免类型包依赖）

## 验收标准

- [ ] 注册 ceremony 全流程：options → 客户端 attestation → verify → 凭证入库（需真实 authenticator，未单测）
- [x] 认证 challengeKey 契约：匿名 options 返回 `anon:` key、verify 回传命中；不回传则失败；已知 userId 可省略（provider.test.ts，mock @simplewebauthn/server）
- [x] counter 更新：认证成功后 counter 写入 mock 返回的 newCounter（provider.test.ts）
- [x] challenge 一次性消费：同 key 二次 verify 失败（provider.test.ts）
- [ ] 多凭证：同一用户可注册多个 passkey（store 支持，未单测）
- [ ] 凭证隔离：用户只能删除自己的凭证（routes 有校验，未单测）
- [ ] 不装 @simplewebauthn/server 时 `./webauthn` 子路径动态 import 报错，不影响主包
