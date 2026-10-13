import type { OAuthPreset } from '../index.js'

/** oauth2-dingtalk（../oauth2-dingtalk）默认部署 */
export const DEFAULT_OAUTH2_DINGTALK_BASE = 'https://dingtalk.auth.xrl.im'

/**
 * oauth2-dingtalk userinfo 端点实际返回（已实读源码核对，src/index.ts:124-129）：
 * 标准 OIDC 格式 —— 服务端已把钉钉的 {openId,nick,avatarUrl} 映射为 {sub,name,email,picture}。
 */
export interface Oauth2DingtalkUserInfo {
  sub: string
  name?: string
  email?: string
  picture?: string
}

/**
 * oauth2-dingtalk 预设：填 orgId（+可选 baseUrl）即用。
 * 返回结构化预设喂给 @homurajs/auth 的 OAuth2Client（鸭子类型互操作，零 import 依赖）。
 */
export function dingtalkOAuth(opts: { orgId: string; baseUrl?: string }): OAuthPreset {
  const base = (opts.baseUrl ?? DEFAULT_OAUTH2_DINGTALK_BASE).replace(/\/$/, '')
  return {
    endpoints: {
      authorizeUrl: `${base}/${opts.orgId}/authorize`,
      tokenUrl: `${base}/${opts.orgId}/token`,
      userinfoUrl: `${base}/${opts.orgId}/userinfo`,
    },
    mapUser: (raw) => {
      const u = raw as Oauth2DingtalkUserInfo
      if (!u?.sub) throw new Error('oauth2-dingtalk userinfo 缺少 sub')
      // picture 为空串时归一为 undefined（服务端 `?? ""` 会产生空串）
      const avatarUrl = u.picture && u.picture.length > 0 ? u.picture : undefined
      return { sub: u.sub, nickname: u.name, avatarUrl }
    },
  }
}
