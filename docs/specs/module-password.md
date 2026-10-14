# Spec — TextPassword 认证（@homurajs/auth PasswordProvider）

## 要构建什么

- 目标：基于用户名密码的本地认证，零外部依赖，作为 OAuth2 的补充/替代
- 依赖：`node:crypto` 内置 `scrypt`（零原生依赖，qw-pages 兼容）

## 行为

### 注册（register）

- 输入：`{ username, password, nickname? }`
- 流程：创建 user（users 表）→ scrypt 哈希密码 → 创建 password 记录（passwords 表，PK = user_id）
- 约束：username UNIQUE（重复抛错透传 409）；user_id 即 passwords 表 PK（1:1，一个账户只能一个密码）
- 密码强度：路由层最低 8 位（Provider 层不强制，交给路由决定）

### 验证（verify）

- 输入：`{ username, password }`
- 流程：findByUsername → 查 password 记录 → scrypt verify（timingSafeEqual）
- 返回：LocalUser 或 null（用户不存在 / 无密码 / 密码错误**不区分**，防枚举攻击）

### 改密码（changePassword）

- 需已登录（路由层 requireAuth 或检查 claims）
- 验证旧密码 → 失败抛错 → 成功则 updateHash

### 删密码（deletePassword）

- 删除 passwords 记录（用户将无法用密码登录，但 OAuth2/WebAuthn 不受影响）

## 存储

- `passwords` 表（PK = user_id，1:1 users）
- 列名显式 snake_case：user_id / password_hash / created_at / updated_at
- 双方言 Drizzle store（createDrizzlePasswordStore）+ PostgREST store（createRestPasswordStore）
- 接口一致（findByUserId / create / updateHash / delete），Provider 不感知差异

## 哈希算法

- scrypt（N=16384, r=8, p=1）—— 见 ADR-023
- 格式：`$scrypt$N,r,p$salt$hash`（salt 16B base64，hash 64B base64）
- 验证：timingSafeEqual 防时序攻击
- 未来升级路径：解析前缀判断算法，新注册用新算法，旧记录验证时兼容

## Hono 路由

- `POST /auth/password/register` → session cookies + 200 JSON
- `POST /auth/password/login` → session cookies + 200 JSON
- `POST /auth/password/change` → 需已登录 → 200 JSON
- `POST /auth/password/delete` → 需已登录 → 200 JSON
- 路由只返回 JSON + cookies，不渲染 HTML

## 验收标准

- [ ] 注册 → 登录 → /api/me 返回正确的 local user sub
- [ ] username 重复注册 → 409
- [ ] 密码错误 → 401（不泄露"用户是否存在"）
- [ ] 改密码：旧密码错误 → 400；成功 → 旧密码无法登录
- [ ] 删密码 → 密码登录不可用，OAuth2/WebAuthn 不受影响
- [ ] 1:1 约束：同 user_id 不能建第二条 password 记录
- [ ] 双 store 接口一致（Drizzle SQL 双方言 + PostgREST）
