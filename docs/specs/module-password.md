# Spec — TextPassword 认证（@homurajs/auth PasswordProvider）

## 要构建什么

- 目标：基于用户名密码的本地认证，零外部依赖，作为 OAuth2 的补充/替代
- 依赖：`node:crypto` 内置 `scrypt`（零原生依赖）
- 模板配置：`AUTH_PASSWORD_ENABLED`（**默认 false，opt-in**）+ `AUTH_PASSWORD_ALLOW_SELF_REGISTER`（默认 true）。
  与 OAuth2（靠 `OAUTH_DINGTALK_ORG_ID`）、WebAuthn（`AUTH_WEBAUTHN_ENABLED` 默认 false）一致——三类认证
  均「配了啥才启用啥」，各能力独立开关，不配则不挂载对应路由（SDK 层 `createAuthRoutes` 也是按传入的
  capability 组合路由，不传 password 就不挂 `/auth/password/*`）

## 行为

### 注册（register）

- 输入：`{ username, password, nickname? }`
- 流程：预检 username 占用 → 创建 user（users 表）→ scrypt 哈希密码 → 创建 password 记录（passwords 表，PK = user_id）
- username 占用走**两道防线**：
  1. 预检 `findByUsername` → 抛类型化 `UsernameTakenError`（跨方言确定，路由回 409 的主路径，不依赖解析 DB 错误文本）
  2. `users.username` **唯一索引**兜底并发：两个请求同时过预检时，create 撞唯一约束，路由层 `isUniqueViolation` 走 cause 链识别后同样回 409
- ⚠ username 唯一性用**显式唯一索引**（`users_username_uidx`）而非 inline `.unique()`：drizzle-kit rc.4 的 sqlite 生成器不落列级 inline UNIQUE（pg 落），inline 写法会让 standalone（缺省 sqlite）迁移静默丢掉唯一约束 → 可注册重复用户名。双方言统一用唯一索引才对称。
- ⚠ `isUniqueViolation` 必须走 **cause 链**：drizzle 把底层驱动错误包成 `DrizzleQueryError`，顶层 message 是 "Failed query: INSERT..."（不含 UNIQUE），只看顶层会漏判、把 409 错发成 400。信号：sqlite `cause.errcode===2067`、pg `cause.code==='23505'`、文本兜底 `/unique constraint|duplicate key/i`。
- 注册两步非原子（store 抽象不暴露事务）：password 创建失败时 best-effort 删除刚建的 user，避免留下「无密码、username 已占用」的孤儿
- 约束：user_id 即 passwords 表 PK（1:1，一个账户只能一个密码）
- 密码强度：路由层最低 8 位（Provider 层不强制，交给路由决定）

### 验证（verify）

- 输入：`{ username, password }`
- 流程：findByUsername → 查 password 记录 → scrypt verify（timingSafeEqual）
- 返回：LocalUser 或 null（用户不存在 / 无密码 / 密码错误**不区分**，防枚举攻击）
- ⚠ 时序均衡：用户不存在 / 无密码记录时也拿一个缓存的**假哈希**跑一遍 scrypt 再丢弃，把两条路径耗时拉平——否则「用户不存在」秒回、「用户存在」跑 ~50-100ms scrypt，响应时间差可被用来枚举有效用户名（即便响应体已统一）

### 改密码（changePassword）

- 需已登录（路由层 requireAuth 或检查 claims）
- 验证旧密码 → 失败抛错 → 成功则 updateHash
- ⚠ 改密成功后路由层吊销该用户**所有** session 的 refresh token（`sessions.revokeUser`）并清 cookie，响应带 `reloginRequired: true`：否则此前被盗的 refresh token 在改密后依然能 rotate 续命，改密本应是止损点。access token 是无状态 JWT，会在自身 TTL 内自然过期。代价是当前会话也需重新登录（密码修改的标准安全语义）

### 删密码（deletePassword）

- 删除 passwords 记录（用户将无法用密码登录，但 OAuth2/WebAuthn 不受影响）

## 存储

- `passwords` 表（PK = user_id，1:1 users）
- 列名显式 snake_case：user_id / password_hash / created_at / updated_at
- 双方言 Drizzle store（createDrizzlePasswordStore）
- 接口一致（findByUserId / create / updateHash / delete），Provider 不感知差异

## 哈希算法

- scrypt（N=16384, r=8, p=1）—— 见 ADR-023
- 格式：`$scrypt$N,r,p$salt$hash`（salt 16B base64，hash 64B base64）
- 验证：timingSafeEqual 防时序攻击
- 未来升级路径：解析前缀判断算法，新注册用新算法，旧记录验证时兼容

## Hono 路由

- `POST /auth/password/register` → session cookies + 200 JSON；username 占用 → 409 `username_taken`；弱密码 → 400 `weak_password`
- `POST /auth/password/login` → session cookies + 200 JSON；凭证错误 → 401 `invalid_credentials`
- `POST /auth/password/change` → 需已登录 → 200 JSON `{ ok, reloginRequired: true }`（吊销全部 session + 清 cookie）
- `POST /auth/password/delete` → 需已登录 → 200 JSON
- `allowRegister=false`（模板 `AUTH_PASSWORD_ALLOW_SELF_REGISTER`）→ register 回 403 `registration_disabled`
- 路由只返回 JSON + cookies，不渲染 HTML

## 验收标准

- [x] 注册 → 登录 → /api/me 返回正确的 local user sub（provider.test.ts / password-routes.test.ts / e2e）
- [x] username 重复注册 → 409（预检 UsernameTakenError + 唯一索引兜底，cause 链识别）
- [x] 密码错误 → 401（不泄露"用户是否存在"，且耗时均衡）
- [x] 改密码：旧密码错误 → 400；成功 → 旧密码无法登录 + 旧 refresh 失效（reloginRequired）
- [x] 删密码 → 密码登录不可用，OAuth2/WebAuthn 不受影响
- [x] 注册时 password 写入失败 → 清理孤儿 user，username 不被占用
- [ ] 1:1 约束：同 user_id 不能建第二条 password 记录（由 PK 保证，未单测）
- [x] 双 store 接口一致（Drizzle SQL 双方言）
