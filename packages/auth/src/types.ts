/**
 * 上游契约唯一事实源。
 * ⚠ 字段以实读 ../oauth2-dingtalk 源码为准（token/userinfo 端点见 specs/module-oauth2）。
 *   钉钉特有的 userinfo 形状（Oauth2DingtalkUserInfo）在 @homura/3p/dingtalk/oauth.ts，
 *   auth 包只认标准 OAuth2/OIDC 契约。
 */

/** 规范化用户身份（各 IdP 的 mapUser 归一结果） */
export interface AuthUser {
  sub: string
  nickname?: string
  avatarUrl?: string
}

export interface OAuth2Endpoints {
  authorizeUrl: string
  tokenUrl: string
  userinfoUrl: string
}

/**
 * 标准 OAuth2 token 响应。
 * 实读核对：oauth2-dingtalk POST /:orgId/token 返回
 *   { access_token, token_type: 'bearer', expires_in }（src/index.ts:91-95）。
 */
export interface TokenResponse {
  access_token: string
  token_type?: string
  expires_in?: number
}
