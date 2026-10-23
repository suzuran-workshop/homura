/**
 * @homurajs/3p/dingtalk：钉钉平台实现。
 *
 * 能力按配置动态声明：
 *  - message/approval/contacts/apps：配了 appKey/appSecret 即声明（实测这四类端点均可达，
 *    其中 approval 的部分端点还需相应权限，但端点存在，故声明能力、由调用处理 403）。
 *  - oauth：仅在 oauthOrgId（oauth2-dingtalk 组织标识）配置时声明。
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
  /** 缺省 agentId（sendWorkMessage 未显式传时的兜底；见下方 wiring 说明） */
  agentId?: string
  /** oauth2-dingtalk（../oauth2-dingtalk）的组织标识；不配则不声明 oauth 能力 */
  oauthOrgId?: string
  /** oauth2-dingtalk 部署地址（默认线上） */
  oauthBaseUrl?: string
  fetchImpl?: typeof fetch
  /** 外呼超时（ms），缺省 15s；经 AbortSignal.timeout 施加 */
  timeoutMs?: number
}

export function createDingtalkPlatform(config: DingtalkPlatformConfig): ThirdPartyPlatform & {
  readonly client: DingtalkClient
} {
  const capabilities: Capability[] = ['message', 'approval', 'contacts', 'apps']
  if (config.oauthOrgId) capabilities.push('oauth')
  const corp = new CorpTokenManager(config)
  const client = new DingtalkClient(corp, { fetchImpl: config.fetchImpl, timeoutMs: config.timeoutMs })
  const defaultAgentId = config.agentId
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
    // message：req 未带 agentId 时用 config.agentId 兜底（asyncsend_v2 必需 agentId）
    sendWorkMessage: (req) =>
      client.sendWorkNotice({ ...req, agentId: req.agentId || defaultAgentId || '' }),
    getSendResult: (agentId, taskId) =>
      client.getSendResult(agentId || defaultAgentId || '', taskId),
    getSendProgress: (agentId, taskId) =>
      client.getSendProgress(agentId || defaultAgentId || '', taskId),
    // approval
    listProcessCodes: (req) => client.listProcessCodes(req),
    createApprovalInstance: (req) => client.createApprovalInstance(req),
    getApprovalInstance: (id) => client.getApprovalInstance(id),
    // contacts
    getUserDetail: (id) => client.getUserDetail(id),
    listDeptUsers: (deptId, opts) => client.listDeptUsers(deptId, opts),
    listSubDepts: (deptId) => client.listSubDepts(deptId),
    getDeptDetail: (deptId) => client.getDeptDetail(deptId),
    getUserByMobile: (mobile) => client.getUserByMobile(mobile),
    listAdmins: () => client.listAdmins(),
    fetchAllContacts: (opts) => client.fetchAllContacts(opts),
    // apps
    listMicroApps: () => client.listMicroApps(),
  }
}
