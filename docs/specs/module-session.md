# Spec — session 管理（@homura/auth）

## 要构建什么
- 目标：自管 session 生命周期（上游无 refresh token），可吊销、可检测复用

## 行为

### 签发（createSession）
- 一次登录会话 = 一个 token family：**sid 与 familyId 合一**（使 revokeSession 可直接走 family 维度吊销）
- HS256 JWT（claims: sub/nickname/avatarUrl/sid/exp + **jti** 保证同秒 rotate 也唯一），TTL 默认 7200s
- refresh token：32B base64url，SHA-256 hex 入库（token_hash/family_id/sid/sub/expires_at/**used_at**/**profile**），TTL 默认 30d
- profile（nickname/avatarUrl）持久化在 refresh_tokens，rotate 时回填新 access token（上游无 refresh，身份不能丢）

### 验证（verifyAccessToken）
- jose jwtVerify（HS256，secret >=32B 启动校验，currentDate 走注入时钟）→ SessionClaims | null

### 刷新（refresh）— rotate 语义
- store.consume(tokenHash)：**UPDATE...RETURNING 原子抢占**（仅 used_at IS NULL 且未过期才标记已用）
- 抢占成功 → 签发新对（同 familyId 延续链条，profile 回填）
- **复用检出**：抢占失败且行已 used → 返回 revoked:true → manager revokeFamily 整族吊销 + 返回 null（盗用信号）
  （不能用「UPDATE 后读 used_at 判复用」——RETURNING 返回的是更新后的值，恒等于本次 ts，会漏检）

### 兜底
- refresh 链终态（过期/吊销/复用检出）：页面请求 302 /auth/login（钉钉免登一跳无感）；API 401

### Hono 集成
- sessionMiddleware：cookie 优先、Bearer 兼容；access 过期且 refresh 有效 → 透明 rotate
- requireAuth：无身份 → /api 或 Accept:json 401 JSON；页面 302
- createAuthRoutes：GET /auth/login、GET /auth/callback、POST /auth/refresh、POST /auth/logout（路径可配）
- cookie：HttpOnly + SameSite=Lax；qw-pages（trust proxy）下 Secure

## 存储
- refresh_tokens 表（pgAuthTables/sqliteAuthTables 从 `@homura/auth/tables` spread 进 App schema 参与迁移）
- createDrizzleSessionStore 双方言实现（原生 SQL，**列名 snake_case 须与 tables.ts 严格对齐**——见 module-schema 教训）；now 时钟可注入（对齐 manager 测试时钟）

## 验收标准
- [x] 全流程桩测试：签发→验证→过期→rotate→旧 token 失效→profile 回填→sid 不变
- [x] 复用检出触发族吊销（重放旧 refresh → 整族失效）
- [x] revokeUser/revokeSession 生效；secret<32B 启动抛错；伪造/篡改 token → null
- [x] hono 集成端到端：login 302→callback 建双 cookie→/api/me→refresh rotate→logout 清 cookie+revokeSession；
      透明 rotate（access 过期 + refresh 有效自动续期）；cookie jar 吸收回吐
