# Spec — session 管理（@homura/auth）

## 要构建什么
- 目标：自管 session 生命周期（上游无 refresh token），可吊销、可检测复用

## 行为

### 签发（createSession）
- 生成 sid（16B 随机）；HS256 JWT（claims: sub/nickname/avatarUrl/sid/exp），TTL 默认 7200s
- refresh token：32B base64url，SHA-256 hex 入库（tokenHash/familyId/sid/sub/expiresAt/revokedAt），TTL 默认 30d

### 验证（verifyAccessToken）
- jose jwtVerify（HS256，secret >=32B 启动校验）→ SessionClaims | null

### 刷新（refresh）— rotate 语义
- store.consume(tokenHash)：原子取出并标记（一次性）；已消费/过期/吊销 → null
- 命中：吊销旧 token + 签发新对（同 familyId、同 sid）
- **复用检出**：consume 返回已消费记录（同 family 二次使用）→ revokeFamily 整族吊销 + 返回 null（盗用信号）

### 兜底
- refresh 链终态（过期/吊销/复用检出）：页面请求 302 /auth/login（钉钉免登一跳无感）；API 401

### Hono 集成
- sessionMiddleware：cookie 优先、Bearer 兼容；access 过期且 refresh 有效 → 透明 rotate
- requireAuth：无身份 → /api 或 Accept:json 401 JSON；页面 302
- createAuthRoutes：GET /auth/login、GET /auth/callback、POST /auth/refresh、POST /auth/logout（路径可配）
- cookie：HttpOnly + SameSite=Lax；qw-pages（trust proxy）下 Secure

## 存储
- refresh_tokens 表（pgAuthTables/sqliteAuthTables spread 进 App schema）；DrizzleSessionStore 双方言实现

## 验收标准
- [ ] 全流程桩测试：签发→验证→过期→rotate→旧 token 失效
- [ ] 复用检出触发族吊销
- [ ] revokeUser/revokeSession 生效
