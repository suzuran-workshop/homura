/**
 * 钉钉新版 API 统一请求器：x-acs-dingtalk-access-token 头、
 * errcode 归一化为 DingtalkError、token 失效自动 invalidate + 重试一次。
 */
import type {
  ApprovalInstance,
  CreateApprovalRequest,
  ProcessSummary,
  PlatformUserDetail,
  PlatformDept,
  WorkMessageRequest,
} from '../index.js'
import type { CorpTokenManager } from './corp-token.js'

export class DingtalkError extends Error {
  constructor(
    public readonly errcode: number,
    public readonly errmsg: string,
    public readonly url?: string,
  ) {
    super(`dingtalk ${errcode}: ${errmsg}`)
    this.name = 'DingtalkError'
  }
}

export interface DingtalkClientOptions {
  fetchImpl?: typeof fetch
  timeoutMs?: number
}

export class DingtalkClient {
  constructor(_corp: CorpTokenManager, _opts?: DingtalkClientOptions) {}

  /** 工作通知：POST /v1.0/message/asyncsend_v2 */
  async sendWorkNotice(_req: WorkMessageRequest): Promise<{ taskId: string }> {
    throw new Error('NotImplemented: DingtalkClient.sendWorkNotice')
  }

  /** 审批模板列表：POST /v1.0/workflow/processCentricV2/list */
  async listProcessCodes(_req?: { name?: string; offset?: number; size?: number }): Promise<
    ProcessSummary[]
  > {
    throw new Error('NotImplemented: DingtalkClient.listProcessCodes')
  }

  /** 发起审批实例：POST /v1.0/workflow/processInstances */
  async createApprovalInstance(_req: CreateApprovalRequest): Promise<{ instanceId: string }> {
    throw new Error('NotImplemented: DingtalkClient.createApprovalInstance')
  }

  /** 审批实例详情：GET /v1.0/workflow/processInstances/{id} */
  async getApprovalInstance(_instanceId: string): Promise<ApprovalInstance> {
    throw new Error('NotImplemented: DingtalkClient.getApprovalInstance')
  }

  /** 用户详情：GET /v1.0/contact/users/{userid} */
  async getUserDetail(_userid: string): Promise<PlatformUserDetail> {
    throw new Error('NotImplemented: DingtalkClient.getUserDetail')
  }

  /** 部门用户（游标式）：POST /v1.0/contact/users/{deptId}/users */
  async listDeptUsers(
    _deptId: number,
    _opts?: { cursor?: number; size?: number },
  ): Promise<{ users: PlatformUserDetail[]; nextCursor?: number }> {
    throw new Error('NotImplemented: DingtalkClient.listDeptUsers')
  }

  /** 子部门列表：GET /v1.0/contact/departments/{deptId} */
  async listSubDepts(_deptId: number): Promise<PlatformDept[]> {
    throw new Error('NotImplemented: DingtalkClient.listSubDepts')
  }
}
