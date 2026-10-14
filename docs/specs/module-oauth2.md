# Spec — OAuth2 客户端（@homurajs/auth + @homurajs/3p 预设）

## 要构建什么
- 目标：通用标准 OAuth2 Authorization Code Flow 客户端；钉钉登录经 ../oauth2-dingtalk

## 行为
- authorizeUrl(returnTo?)：state（16B base64url）入 TtlKv（TTL 5min，value=returnTo），拼 authorize URL（client_id/redirect_uri/response_type=code/scope/extraParams）
- callback({code, state})：kv.take(state) 一次性消费（未命中拒绝；allowNoState=true 显式 dev 放行）→ POST tokenUrl（form: grant_type=authorization_code/code/client_id/client_secret/redirect_uri）→ GET userinfoUrl（Bearer）→ mapUser
- 错误：token 端点非 2xx → 抛含 body 的错误；userinfo 非 2xx → 抛错
- **Identity Resolver（2026-10-14 新增）**：callback 路由拿到 IdP 的 AuthUser 后，调用 identityResolver.resolve(provider, idpSub, profile) → local user。默认实现 createDefaultIdentityResolver 在 oauth2_identity_links 查 link → 有则返回已有 user → 无则 JIT 建户+建 link（jit 默认 true，可配 false 拒绝未知身份）。session 的 sub 现在是 local user.id，不再是 IdP subject。路由统一到 /auth/oauth2/*（旧 /auth/login + /auth/callback 已废弃）

## 上游契约快照（oauth2-dingtalk，3p/dingtalk/oauth.ts 消费）
> ⚠ 已实读 ../oauth2-dingtalk/src/index.ts 核对（2.2 步），修正了侦察期的字段假设：
> 服务端**内部**从钉钉拿 `{openId,nick,avatarUrl}`，但**对外返回标准 OIDC 格式**。

- `GET /:orgId/authorize` → 302 钉钉授权页（透传 state）
- `POST /:orgId/token`（form `code=...`）→ `{ access_token, token_type: 'bearer', expires_in }`（src/index.ts:91-95）
- `GET /:orgId/userinfo`（Bearer）→ `{ sub, name, email, picture }`（标准 OIDC；src/index.ts:124-129，
  服务端已把 `openId→sub / nick→name / avatarUrl→picture`，email 为 `<openId>@dingtalk.internal`）
- 默认 baseUrl https://dingtalk.auth.xrl.im；仅 code flow、无 refresh、无 client credentials
- **映射责任在 3p 预设的 mapUser**：`sub←sub / nickname←name / avatarUrl←picture`（picture 空串归一 undefined）；
  auth 包只认标准 `TokenResponse`，不含钉钉特有类型

## 输入 / 输出
- 输入：OAuth2ClientConfig（endpoints 来自 3p 预设，鸭子类型互操作；stateKv 由 core 内存或 db 实现注入）
- 输出：`callback()` → `{ user: AuthUser, returnTo }`；AuthUser = `{ sub, nickname?, avatarUrl? }`

## 验收标准
- [x] fetchImpl 桩全流程测试（authorize→callback→mapUser，form 编码 + Bearer 头断言）
- [x] state 过期/重放/伪造/缺失拒绝；allowNoState 显式 opt-in
- [x] 实读 oauth2-dingtalk 源码核对 token/userinfo 字段（修正 openId→sub 等），3p oauth 预设快照测试固化
- [x] token/userinfo 端点非 2xx 抛错；mapUser 抛错透传；authorizeExtraParams 透传
