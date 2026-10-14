# Spec — session 管理（@homurajs/auth）

## 要构建什么

- 目标：自管 session 生命周期（上游无 refresh token），可吊销、可检测复用

## 行为

### 签发（createSession）

- 一次登录会话 = 一个 token family：**sid 与 familyId 合一**（使 revokeSession 可直接走 family 维度吊销）
- HS256 JWT（claims: sub/nickname/avatarUrl/sid/exp + **jti** 保证同秒 rotate 也唯一），TTL 默认 7200s
- **sub 语义（2026-10-14 变更）**：sub 是 local user ID（users 表的 id），不再是 IdP subject。
  三种凭证（TextPassword / WebAuthn / OAuth2）都通过 local user 统一身份，session 层不感知凭证来源
- refresh token：32B base64url，SHA-256 hex 入库（token_hash/family_id/sid/sub/expires_at/**used_at**/**profile**），TTL 默认 30d
- profile（nickname/avatarUrl）持久化在 refresh_tokens，rotate 时回填新 access token（上游无 refresh，身份不能丢）

### 验证（verifyAccessToken）

- jose jwtVerify（HS256，secret >=32B 启动校验，currentDate 走注入时钟）→ SessionClaims | null

### 刷新（refresh）— rotate 语义

- store.consume(tokenHash)：**原子抢占**（仅 used_at IS NULL 且未过期才标记已用）
  - SQL 版：`UPDATE...WHERE used_at IS NULL RETURNING`
  - REST 版（qw-pages）：`PATCH ?token_hash=eq.X&expires_at=gt.ts&used_at=is.null` + `Prefer: return=representation`，**返回空数组即抢占失败**——PostgREST 会生成同一条带 WHERE 的 UPDATE...RETURNING，语义等价（已线上实测：三路并发抢占恰好一个赢家）
- 抢占成功 → 签发新对（同 familyId 延续链条，profile 回填）
- **复用检出**：抢占失败且行已 used → 返回 revoked:true → manager revokeFamily 整族吊销 + 返回 null（盗用信号）
  （不能用「UPDATE 后读 used_at 判复用」——RETURNING 返回的是更新后的值，恒等于本次 ts，会漏检）
  REST 版同理：过期 token 抢占返回 0 行且 used_at 仍为 null，store 返回 null 而**不是** revoked:true

### 兜底

- refresh 链终态（过期/吊销/复用检出）：页面请求 302 /auth/login（钉钉免登一跳无感）；API 401

### Hono 集成

- sessionMiddleware：cookie 优先、Bearer 兼容；access 过期且 refresh 有效 → 透明 rotate
- requireAuth：无身份 → /api 或 Accept:json 401 JSON；页面 302
- createAuthRoutes：GET /auth/login、GET /auth/callback、POST /auth/refresh、POST /auth/logout（路径可配）
- cookie：HttpOnly + SameSite=Lax；qw-pages（trust proxy）下 Secure

## 存储

- refresh_tokens 表（pgAuthTables/sqliteAuthTables 从 `@homurajs/auth/tables` spread 进 App schema 参与迁移）
- createDrizzleSessionStore 双方言实现（原生 SQL，**列名 snake_case 须与 tables.ts 严格对齐**——见 module-schema 教训）；now 时钟可注入（对齐 manager 测试时钟）
- createRestSessionStore（PostgREST 版，qw-pages 形态）：同一张表、同一套 snake_case 列名；**不建表**（App 无 DDL 权限，表与 anon policy 须部署期用受控迁移建，缺 policy 时是静默失败）；now 时钟同样可注入
- 两版接口完全一致（create/consume/revokeFamily/revokeUser），SessionManager 与 hono 层不感知差异——模板 app.ts 按 `DbBundle.kind` 选实现

## 验收标准

- [x] 全流程桩测试：签发→验证→过期→rotate→旧 token 失效→profile 回填→sid 不变
- [x] 复用检出触发族吊销（重放旧 refresh → 整族失效）
- [x] revokeUser/revokeSession 生效；secret<32B 启动抛错；伪造/篡改 token → null
- [x] hono 集成端到端：login 302→callback 建双 cookie→/api/me→refresh rotate→logout 清 cookie+revokeSession；
      透明 rotate（access 过期 + refresh 有效自动续期）；cookie jar 吸收回吐
- [x] REST 版 store 单测：列名与 tables.ts 对齐、抢占成功时不发第二条查询、三种失败分支
      （不存在 / 已消费→revoked:true / 未消费但过期→null）、bigint 以字符串返回时仍判为已消费、族与用户吊销的过滤条件
- [x] consume 依赖的 PostgREST 语义线上实测：三路并发抢占恰好一个赢家、过期 token 不误报为复用、
      族吊销只命中未消费行（见 module-qw-pages「consume 原子抢占语义」）
- [ ] REST 版 store 的函数体在部署态执行（需真实钉钉 IdP 走完 /auth/callback）
