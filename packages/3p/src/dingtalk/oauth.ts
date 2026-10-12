import type { OAuthPreset } from '../index.js'

/** oauth2-dingtalk（../oauth2-dingtalk）默认部署 */
export const DEFAULT_OAUTH2_DINGTALK_BASE = 'https://dingtalk.auth.xrl.im'

/**
 * oauth2-dingtalk 预设：填 orgId（+可选 baseUrl）即用。
 * 返回结构化预设喂给 @homura/auth 的 OAuth2Client（鸭子类型互操作，零 import 依赖）。
 * userinfo 形状（服务端已过滤）：{ openId, nick, avatarUrl? }
 */
export function dingtalkOAuth(
  opts: { orgId: string; baseUrl?: string },
): OAuthPreset {
  const base = (opts.baseUrl ?? DEFAULT_OAUTH2_DINGTALK_BASE).replace(/\/$/, '')
  return {
    endpoints: {
      authorizeUrl: `${base}/${opts.orgId}/authorize`,
      tokenUrl: `${base}/${opts.orgId}/token`,
      userinfoUrl: `${base}/${opts.orgId}/userinfo`,
    },
    mapUser: (raw) => {
      const u = raw as { openId?: string; nick?: string; avatarUrl?: string }
      if (!u?.openId) throw new Error('oauth2-dingtalk userinfo 缺少 openId')
      return { sub: u.openId, nickname: u.nick, avatarUrl: u.avatarUrl }
    },
  }
}
