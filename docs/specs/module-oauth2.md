# Spec — OAuth2 客户端（@homura/auth + @homura/3p 预设）

## 要构建什么
- 目标：通用标准 OAuth2 Authorization Code Flow 客户端；钉钉登录经 ../oauth2-dingtalk

## 行为
- authorizeUrl(returnTo?)：state（16B base64url）入 TtlKv（TTL 5min，value=returnTo），拼 authorize URL（client_id/redirect_uri/response_type=code/scope/extraParams）
- callback({code, state})：kv.take(state) 一次性消费（未命中拒绝；allowNoState=true 显式 dev 放行）→ POST tokenUrl（form: grant_type=authorization_code/code/client_id/client_secret/redirect_uri）→ GET userinfoUrl（Bearer）→ mapUser
- 错误：token 端点非 2xx → 抛含 body 的错误；userinfo 非 2xx → 抛错

## 上游契约快照（oauth2-dingtalk，3p/dingtalk/oauth.ts 消费）
- `GET /:orgId/authorize` → 302 钉钉授权页
- `POST /:orgId/token`（form `code=...`）→ `{ access_token }`（以实读 ../oauth2-dingtalk 源码核对为准，轮二 2.2 步强制）
- `GET /:orgId/userinfo`（Bearer）→ `{ openId, nick, avatarUrl? }`
- 默认 baseUrl https://dingtalk.auth.xrl.im；仅 code flow、无 refresh、无 client credentials

## 输入 / 输出
- 输入：OAuth2ClientConfig（endpoints 来自 3p 预设，鸭子类型互操作）
- 输出：AuthUser { sub, nickname?, avatarUrl? }

## 验收标准
- [ ] fetchImpl 桩全流程测试（authorize→callback→mapUser）
- [ ] state 过期/重放/缺失拒绝；allowNoState 开关
- [ ] 实读 oauth2-dingtalk 源码核对 token 响应字段，快照测试固化
