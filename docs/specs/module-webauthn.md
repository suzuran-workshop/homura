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
   - 调用 `generateAuthenticationOptions`
   - challenge 存入 TtlKv（key = `${userId}:auth` 或 `anon:${random}`）
   - 返回 options JSON（客户端传给 `startAuthentication`）
2. `POST /auth/webauthn/auth/verify`
   - 按 credentialId 查凭证 → 找 user → 消费 challenge
   - 调用 `verifyAuthenticationResponse` 验证 assertion
   - 更新 counter（防重放）
   - 创建 session → cookies + 200 JSON

### 凭证管理

- `GET /auth/webauthn/credentials` → 已登录用户列出所有凭证
- `POST /auth/webauthn/credentials/delete` → 已登录用户删除指定凭证（只能删自己的）

## 存储

- `webauthn_credentials` 表（PK = credentialId base64url，1:N users）
- 列名显式 snake_case：id / user_id / public_key / counter / device_type / backed_up / transports / display_name / created_at
- 双方言 Drizzle store（createDrizzleWebauthnCredentialStore）+ PostgREST store（createRestWebauthnCredentialStore）

## 配置

- `AUTH_WEBAUTHN_ENABLED`（默认 false）
- `AUTH_WEBAUTHN_RP_ID`（域名，如 app.example.com）
- `AUTH_WEBAUTHN_RP_NAME`（显示名，如 "My App"）
- `AUTH_WEBAUTHN_ORIGIN`（允许的 origin，如 https://app.example.com）

## 依赖策略

- `@simplewebauthn/server` ^11 是 optional peer dep
- 动态 import 在 `provider.ts` 内部（`await import('@simplewebauthn/server')`）
- `@simplewebauthn/browser` 由 App 前端直接安装（SDK 不管客户端）
- `AuthenticatorTransportFuture` 类型本地定义（避免类型包依赖）

## 验收标准

- [ ] 注册 ceremony 全流程：options → 客户端 attestation → verify → 凭证入库
- [ ] 认证 ceremony 全流程：options → 客户端 assertion → verify → session
- [ ] counter 更新：每次认证成功 counter 递增
- [ ] 多凭证：同一用户可注册多个 passkey
- [ ] 凭证隔离：用户只能删除自己的凭证
- [ ] challenge 过期（5min 后 take 返回 null）→ 验证失败
- [ ] 双 store 接口一致（Drizzle SQL 双方言 + PostgREST）
- [ ] 不装 @simplewebauthn/server 时 `./webauthn` 子路径动态 import 报错，不影响主包
