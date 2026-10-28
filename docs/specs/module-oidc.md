# Spec — OIDC 客户端（@homurajs/auth + @homurajs/3p 预设）

## 要构建什么
- 目标：通用标准 OIDC Authorization Code Flow 客户端（id_token 验签 + sub 交叉核对）；
  钉钉登录经 ../oidc-dingtalk（v2.0.0，OIDC Provider：discovery + id_token HS256）

## 行为
- authorizeUrl(returnTo?)：state（16B base64url）入 TtlKv（TTL 5min，value=returnTo），拼 authorize URL（client_id/redirect_uri/response_type=code/scope（缺省 openid）/extraParams）
- callback({code, state})：kv.take(state) 一次性消费（未命中拒绝；allowNoState=true 显式 dev 放行）→ POST tokenUrl（form: grant_type/code/client_id/client_secret/redirect_uri）→ **id_token 验签**（HS256，密钥=clientSecret；jwtVerify 校验 iss=issuer、aud=clientId、exp±60s leeway）→ GET userinfoUrl（Bearer）→ mapUser → **userinfo.sub 与 id_token.sub 交叉核对**（不一致即 sub_mismatch 拒绝）
- 错误：统一 `OidcError`（code：invalid_state/missing_code/token_failed/userinfo_failed/missing_id_token/id_token_invalid/sub_mismatch/map_failed），App 可按 code 渲染友好页；hono 路由映射 401 `{ error: 'oidc_failed', code }`
- **Identity Resolver**：callback 路由拿到 IdP 的 AuthUser 后，调用 identityResolver.resolve(provider, idpSub, profile) → local user。默认实现 createDefaultIdentityResolver 在 oidc_identity_links 查 link → 有则返回已有 user → 无则 JIT 建户+建 link（jit 默认 true，可配 false 拒绝未知身份）。目录白名单准入用 createDirectoryProvisioningResolver（见 ADR-026）。session 的 sub 是 local user.id
- 路径统一 /auth/oidc/*（authorize/callback）；requireAuth 缺省 loginPath 同步

## 上游契约快照（oidc-dingtalk v2.0.0，3p/dingtalk/oauth.ts 消费）
> ⚠ 已实读 ../oidc-dingtalk/src/index.ts 核对。

- `GET /:orgId/.well-known/openid-configuration` → discovery（issuer/端点/HS256）
- `GET /:orgId/authorize` → 302 钉钉授权页（透传 state）
- `POST /:orgId/token`（form `code=...`）→ `{ access_token, token_type: 'bearer', expires_in, id_token }`
  （id_token：HS256，iss=`<base>/<orgId>`，sub=钉钉企业 userid，aud=clientId，name/picture）
- `GET /:orgId/userinfo`（Bearer）→ `{ sub, name, email, picture }`（sub 与 id_token 同源同值）
- 默认 baseUrl https://dingtalk.auth.xrl.im；仅 code flow、无 refresh、无 nonce（ADR-005 @oidc-dingtalk）
- **映射责任在 3p 预设的 mapUser**：`sub←sub / nickname←name / avatarUrl←picture`（picture 空串归一 undefined）

## 输入 / 输出
- 输入：OidcClientConfig（issuer+endpoints 来自 3p 预设，鸭子类型互操作；stateKv 由 core 注入）
- 输出：`callback()` → `{ user: AuthUser, returnTo, claims }`；claims 为验签后的 id_token payload

## 验收标准
- [x] fetchImpl 桩全流程测试（authorize→token→验签→userinfo→交叉核对→mapUser，form 编码 + Bearer 头断言）
- [x] id_token 篡改/错 issuer/错 aud/过期 拒绝；缺 id_token 拒绝；sub 交叉核对拒绝
- [x] state 过期/重放/伪造/缺失拒绝；allowNoState 显式 opt-in
- [x] 实读 oidc-dingtalk 源码核对 token/id_token/userinfo 字段，3p 预设快照测试固化
