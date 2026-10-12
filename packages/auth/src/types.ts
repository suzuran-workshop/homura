/**
 * 上游契约唯一事实源（../oauth2-dingtalk 等）。
 * ⚠ 字段以 ../oauth2-dingtalk 实测为准，只改此文件。
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

/** 标准 OAuth2 token 响应（oauth2-dingtalk 实际返回字段以实读核对为准） */
export interface TokenResponse {
  access_token: string
  token_type?: string
  expires_in?: number
}

/** oauth2-dingtalk 服务端过滤后的 userinfo 形状（预设 mapUser 的输入） */
export interface DingtalkUserInfo {
  openId: string
  nick: string
  avatarUrl?: string
}
