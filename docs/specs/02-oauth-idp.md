# Spec 02: OAuth IdP（WebAuthn + 钉钉 OAuth）

> 平台自建 OAuth IdP，支持 WebAuthn 和钉钉 OAuth 登录

## 目标

实现完整的 OAuth2 授权服务器，支持两种登录方式：
1. WebAuthn（Passkey）：生物识别 / 安全密钥，无密码注册登录
2. 钉钉 OAuth：企业用户一键登录，自动同步组织架构

彻底移除密码登录（SHA256、bcrypt）。

## 技术选型

| 组件 | 选型 | 原因 |
|------|------|------|
| WebAuthn | `go-webauthn/webauthn` | Go 生态最成熟的 WebAuthn 库 |
| OAuth2 | 自建 | 轻量、完全自控 |
| Token | JWT (RS256) | 非对称签名，应用可验证 |
| 存储 | PostgreSQL + Redis | credential 存 DB，session 存 Redis |

## 实现清单

### 后端

#### 1. 数据模型

**`model/webauthn_credential.go`**：
```go
type WebAuthnCredential struct {
    ID              string `gorm:"primaryKey"`
    UserID          int    `gorm:"index"`
    CredentialID    []byte `gorm:"uniqueIndex"`
    PublicKey       []byte
    AttestationType string
    AAGUID          string
    SignCount       uint32
    CreatedAt       time.Time
    LastUsedAt      *time.Time
}
```

**`model/oauth_client.go`**（应用作为 OAuth client）：
```go
type OAuthClient struct {
    ID           string `gorm:"primaryKey"`
    OrgID        int    `gorm:"index"`
    Name         string
    ClientSecret string
    RedirectURIs []string `gorm:"type:jsonb"`
    Scopes       []string `gorm:"type:jsonb"`
    CreatedAt    time.Time
}
```

**`model/oauth_token.go`**：
```go
type OAuthToken struct {
    ID           string `gorm:"primaryKey"`
    UserID       int    `gorm:"index"`
    OrgID        int    `gorm:"index"`
    ClientID     string
    Scope        string
    ExpiresAt    time.Time
    RevokedAt    *time.Time
    CreatedAt    time.Time
}
```

#### 2. OAuth 端点

**`internal/oauth/server.go`**：
- `GET /oauth/authorize`：授权码流程入口
- `POST /oauth/token`：换 token（authorization_code、refresh_token）
- `POST /oauth/revoke`：撤销 token
- `GET /.well-known/openid-configuration`：OAuth 元数据

**`internal/oauth/webauthn.go`**：
- `POST /oauth/webauthn/register/begin`：开始注册 ceremony
- `POST /oauth/webauthn/register/finish`：完成注册
- `POST /oauth/webauthn/login/begin`：开始登录 ceremony
- `POST /oauth/webauthn/login/finish`：完成登录

**`internal/oauth/dingtalk.go`**：
- `GET /oauth/dingtalk/authorize`：跳转钉钉授权页
- `GET /oauth/dingtalk/callback`：钉钉回调，换 user info，自动注册/登录

#### 3. Token 管理

**`internal/oauth/token.go`**：
- `GenerateAccessToken(userID, orgID, scope) (string, error)`：签发 JWT
- `GenerateRefreshToken(userID, orgID) (string, error)`：签发 refresh token
- `ValidateToken(tokenString) (*Claims, error)`：验证 token
- `RevokeToken(tokenID) error`：撤销 token

Token 格式：
- access_token：JWT，RS256 签名，15 分钟过期
- refresh_token：随机字符串，存 PostgreSQL，30 天过期

#### 4. 中间件

**`middleware/oauth.go`**：
- `OAuthAuth()`：验证 access_token（JWT 或 introspection）
- `RequireScope(scope string)`：检查 token 的 scope

#### 5. 前端

**`frontend/app/src/views/Login.tsx`**：
- 支持用户名/密码登录（多组织时显示组织选择器）
- Passkey (WebAuthn) 登录按钮（调用 `navigator.credentials.get()`）
- 钉钉 OAuth 登录按钮（跳转 `/oauth/dingtalk/authorize`）

**`frontend/app/src/views/OOBE.tsx`**：
- 首次运行向导，含 Passkey 注册（调用 `navigator.credentials.create()`）

**`frontend/app/src/api/webauthn.ts`**：
- `registerPasskey()`、`loginWithPasskey()`
- `isWebAuthnSupported()`

**`frontend/app/src/api/oauth.ts`**：
- `getDingTalkAuthorizeURL()`

### 数据库迁移

**`docs/sql/02_oauth_migration.sql`**：
```sql
-- 新增表
CREATE TABLE webauthn_credentials (...);
CREATE TABLE oauth_clients (...);
CREATE TABLE oauth_tokens (...);

-- 移除密码字段
ALTER TABLE users DROP COLUMN password_hash;
ALTER TABLE users DROP COLUMN salt;

-- 新增 OAuth 相关字段
ALTER TABLE users ADD COLUMN email VARCHAR(255);
ALTER TABLE users ADD COLUMN email_verified BOOLEAN DEFAULT FALSE;
```

## 完成标准

- [ ] WebAuthn 注册流程可用（注册 Passkey → 登录）
- [ ] WebAuthn 登录流程可用（Passkey 认证 → 获取 token）
- [ ] 钉钉 OAuth 登录可用（跳转钉钉 → 回调 → 获取 token）
- [ ] OAuth2 authorization_code 流程可用
- [ ] Token 刷新可用（refresh_token → 新 access_token）
- [ ] Token 撤销可用（revoke 后不能再用）
- [ ] 密码登录彻底移除（`users` 表无 password_hash 字段）
- [ ] 前端登录页更新（WebAuthn + 钉钉按钮）
- [ ] 单元测试覆盖 WebAuthn ceremony、OAuth 流程
- [ ] 集成测试覆盖完整登录流程

## 安全注意事项

- WebAuthn credential 必须加密存储（AES-256-GCM）
- OAuth client_secret 必须加密存储（bcrypt）
- Token 必须用 RS256 签名（非对称）
- 钉钉 OAuth state 参数必须防 CSRF（存 Redis，5 分钟过期）
- Rate limiting：WebAuthn 登录失败 5 次锁定 15 分钟

## 预计工作量

5-7 天（Agent 执行）
