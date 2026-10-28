import type { OidcPreset } from '../index.js'

/** oidc-dingtalk（../oidc-dingtalk）默认部署（现网域名） */
export const DEFAULT_OIDC_DINGTALK_BASE = 'https://dingtalk.auth.ahkdxx.cn'

/**
 * oidc-dingtalk userinfo 端点实际返回（已实读源码核对）：
 * 标准 OIDC 格式 —— 服务端已把钉钉的 {openId,nick,avatarUrl} 映射为 {sub,name,email,picture}，
 * 且 sub 与 id_token 的 sub 同源同值（均为钉钉企业 userid）。
 */
export interface DingtalkUserInfo {
  sub: string
  name?: string
  email?: string
  picture?: string
}

/**
 * oidc-dingtalk 预设：填 orgId（+可选 baseUrl）即用。
 * 返回结构化预设喂给 @homurajs/auth 的 OidcClient（鸭子类型互操作，零 import 依赖）。
 */
export function dingtalkOidc(opts: { orgId: string; baseUrl?: string }): OidcPreset {
  const base = (opts.baseUrl ?? DEFAULT_OIDC_DINGTALK_BASE).replace(/\/$/, '')
  return {
    issuer: `${base}/${opts.orgId}`,
    endpoints: {
      authorizeUrl: `${base}/${opts.orgId}/authorize`,
      tokenUrl: `${base}/${opts.orgId}/token`,
      userinfoUrl: `${base}/${opts.orgId}/userinfo`,
    },
    mapUser: (raw) => {
      const u = raw as DingtalkUserInfo
      if (!u?.sub) throw new Error('oidc-dingtalk userinfo 缺少 sub')
      // picture 为空串时归一为 undefined（服务端 `?? ""` 会产生空串）
      const avatarUrl = u.picture && u.picture.length > 0 ? u.picture : undefined
      return { sub: u.sub, nickname: u.name, avatarUrl }
    },
  }
}
