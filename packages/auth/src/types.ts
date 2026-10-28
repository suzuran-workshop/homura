/**
 * 上游契约唯一事实源。
 * ⚠ 字段以实读 ../oidc-dingtalk 源码为准（token/userinfo/id_token 端点见 specs/module-oidc）。
 *   钉钉特有的 userinfo 形状（DingtalkUserInfo）在 @homurajs/3p/dingtalk/oauth.ts，
 *   auth 包只认标准 OIDC 契约。
 */

/** 规范化用户身份（各 IdP 的 mapUser 归一结果） */
export interface AuthUser {
  sub: string
  nickname?: string
  avatarUrl?: string
}

/** OIDC Provider 端点集（discovery 文档的子集） */
export interface OidcEndpoints {
  authorizeUrl: string
  tokenUrl: string
  userinfoUrl: string
}

/**
 * 标准 OIDC token 响应。
 * 实读核对：oidc-dingtalk POST /:orgId/token 返回
 *   { access_token, token_type: 'bearer', expires_in, id_token }（src/index.ts）。
 * id_token 为 HS256 签名 JWT（密钥即 clientSecret），sub = 钉钉企业 userid。
 */
export interface OidcTokenResponse {
  access_token: string
  token_type?: string
  expires_in?: number
  id_token: string
}
