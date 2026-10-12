/**
 * @homura/3p/dingtalk：钉钉平台实现。
 * 能力按配置动态声明：oauth 仅在 oauthOrgId（oauth2-dingtalk 组织标识）配置时声明；
 * message/approval/contacts 在 appKey/appSecret 配置时声明。
 * （webhook 回调为未来 capability，本轮不做——见 docs/specs/module-3p 占位章节）
 */
import type { Capability, ThirdPartyPlatform } from '../index.js'
import { CorpTokenManager } from './corp-token.js'
import { DingtalkClient } from './api.js'
import { dingtalkOAuth } from './oauth.js'

export { CorpTokenManager } from './corp-token.js'
export { DingtalkClient, DingtalkError } from './api.js'
export type { DingtalkClientOptions } from './api.js'
export { dingtalkOAuth, DEFAULT_OAUTH2_DINGTALK_BASE } from './oauth.js'

export interface DingtalkPlatformConfig {
  appKey: string
  appSecret: string
  agentId?: string
  /** oauth2-dingtalk（../oauth2-dingtalk）的组织标识；不配则不声明 oauth 能力 */
  oauthOrgId?: string
  /** oauth2-dingtalk 部署地址（默认线上） */
  oauthBaseUrl?: string
  fetchImpl?: typeof fetch
}

export function createDingtalkPlatform(config: DingtalkPlatformConfig): ThirdPartyPlatform & {
  readonly client: DingtalkClient
} {
  const capabilities: Capability[] = ['message', 'approval', 'contacts']
  if (config.oauthOrgId) capabilities.push('oauth')
  const corp = new CorpTokenManager(config)
  const client = new DingtalkClient(corp, { fetchImpl: config.fetchImpl })
  return {
    name: 'dingtalk',
    capabilities,
    client,
    ...(config.oauthOrgId
      ? {
          oauth: () =>
            dingtalkOAuth({ orgId: config.oauthOrgId!, baseUrl: config.oauthBaseUrl }),
        }
      : {}),
    sendWorkMessage: (req) => client.sendWorkNotice(req),
    listProcessCodes: (req) => client.listProcessCodes(req),
    createApprovalInstance: (req) => client.createApprovalInstance(req),
    getApprovalInstance: (id) => client.getApprovalInstance(id),
    getUserDetail: (id) => client.getUserDetail(id),
    listDeptUsers: (deptId, opts) => client.listDeptUsers(deptId, opts),
    listSubDepts: (deptId) => client.listSubDepts(deptId),
  }
}
