/**
 * 钉钉新版 v1.0 API 统一请求器：x-acs-dingtalk-access-token 头、
 * errcode 归一化为 DingtalkError、token 失效自动 invalidate + 重试一次。
 *
 * 端点引用（钉钉开放平台 2025 版）：
 * - 工作通知：POST https://oapi.dingtalk.com/topapi/message/corpconversation/asyncsend_v2（旧版 topapi）
 * - 审批模板列表：POST /v1.0/workflow/processCentricV2/list
 * - 发起审批：POST /v1.0/workflow/processInstances
 * - 审批详情：GET /v1.0/workflow/processInstances/{instanceId}
 * - 用户详情：GET /v1.0/contact/users/{userid}
 * - 部门用户：POST /v1.0/contact/users/{deptId}/users
 * - 子部门：GET /v1.0/contact/departments/{deptId}
 */
import type {
  ApprovalInstance,
  CreateApprovalRequest,
  ProcessSummary,
  PlatformDept,
  PlatformUserDetail,
  WorkMessageRequest,
} from '../index.js'
import type { CorpTokenManager } from './corp-token.js'

const DINGTALK_API = 'https://api.dingtalk.com'

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
  private fetchImpl: typeof fetch
  private timeoutMs: number

  constructor(
    private corp: CorpTokenManager,
    opts?: DingtalkClientOptions,
  ) {
    this.fetchImpl = opts?.fetchImpl ?? fetch
    this.timeoutMs = opts?.timeoutMs ?? 15_000
  }

  // ── 工作通知 ──────────────────────────────────────────────
  /**
   * POST /v1.0/message/asyncsend_v2
   * 注意：实际测试表明新版 v1.0 端点需钉钉白名单，旧版 topapi 端点通用可用。
   * 此处使用旧版端点保证通用性（新旧两版 msg 结构兼容）。
   */
  async sendWorkNotice(req: WorkMessageRequest): Promise<{ taskId: string }> {
    // 绝不过滤空应发人（钉钉返回 InvalidParameter，不吞信息不吞错误）。
    if (!req.userIds || req.userIds.length === 0) {
      throw new DingtalkError(-1, 'userIds 不能为空')
    }
    const body: Record<string, unknown> = {
      agent_id: Number(req.agentId),
      userid_list: req.userIds.join(','),
      msg: buildMsgBody(req.msg),
    }
    const data = await this.post<{ task_id: string }>(
      '/topapi/message/corpconversation/asyncsend_v2',
      body,
    )
    return { taskId: String(data.task_id) }
  }

  // ── 审批 ──────────────────────────────────────────────────
  async listProcessCodes(
    req?: { name?: string; offset?: number; size?: number },
  ): Promise<ProcessSummary[]> {
    const body: Record<string, unknown> = {}
    if (req?.name) body['approvalName'] = req.name
    if (req?.offset !== undefined && req?.size !== undefined) {
      body['offset'] = req.offset
      body['size'] = req.size
    }
    const data = await this.post<{
      result?: {
        list?: Array<{ processCode: string; name: string; description?: string }>
      }
    }>('/v1.0/workflow/processCentricV2/list', body)
    return (data.result?.list ?? []).map((p) => ({
      processCode: p.processCode,
      name: p.name,
      description: p.description,
    }))
  }

  async createApprovalInstance(req: CreateApprovalRequest): Promise<{ instanceId: string }> {
    const body = {
      originatorUserId: req.originatorUserId,
      processCode: req.processCode,
      formComponents: req.formComponents.map((f) => ({ name: f.name, value: f.value })),
    }
    const data = await this.post<{ instanceId: string }>(
      '/v1.0/workflow/processInstances',
      body,
    )
    return { instanceId: data.instanceId }
  }

  async getApprovalInstance(instanceId: string): Promise<ApprovalInstance> {
    const data = await this.get<{
      instanceId: string
      processCode: string
      status: string
      result?: string
      title?: string
      originatorUserId?: string
      createTime?: string
      finishTime?: string
      tasks?: Array<Record<string, unknown>>
    }>(`/v1.0/workflow/processInstances/${instanceId}`)
    return {
      instanceId: data.instanceId,
      processCode: data.processCode,
      status: (data.status as ApprovalInstance['status']) ?? 'RUNNING',
      result: data.result,
      title: data.title,
      originatorUserId: data.originatorUserId,
      createTime: data.createTime,
      finishTime: data.finishTime,
      tasks: data.tasks,
    }
  }

  // ── 通讯录 ────────────────────────────────────────────────
  async getUserDetail(userid: string): Promise<PlatformUserDetail> {
    const data = await this.get<{
      userid: string
      unionid?: string
      name?: string
      title?: string
      avatar?: string
      mobile?: string
      email?: string
      deptIdList?: number[]
    }>(`/v1.0/contact/users/${userid}`)
    return {
      userid: data.userid,
      unionid: data.unionid,
      name: data.name,
      title: data.title,
      avatarUrl: data.avatar,
      mobile: data.mobile,
      email: data.email,
      deptIdList: data.deptIdList,
    }
  }

  async listDeptUsers(
    deptId: number,
    opts?: { cursor?: number; size?: number },
  ): Promise<{ users: PlatformUserDetail[]; nextCursor?: number }> {
    const data = await this.post<{
      hasMore?: boolean
      nextCursor?: number
      list?: Array<{
        userid: string
        unionid?: string
        name?: string
        title?: string
        avatar?: string
        mobile?: string
        email?: string
        deptIdList?: number[]
      }>
    }>(`/v1.0/contact/users/${deptId}/users`, {
      cursor: opts?.cursor,
      size: opts?.size,
    })
    return {
      users: (data.list ?? []).map((u) => ({
        userid: u.userid,
        unionid: u.unionid,
        name: u.name,
        title: u.title,
        avatarUrl: u.avatar,
        mobile: u.mobile,
        email: u.email,
        deptIdList: u.deptIdList,
      })),
      nextCursor: data.nextCursor,
    }
  }

  async listSubDepts(deptId: number): Promise<PlatformDept[]> {
    const data = await this.get<{ deptId: number; name: string; parentDeptId?: number }[]>(
      `/v1.0/contact/departments/${deptId}`,
    )
    return (Array.isArray(data) ? data : []).map((d) => ({
      deptId: d.deptId,
      name: d.name,
      parentDeptId: d.parentDeptId,
    }))
  }

  // ── 内部工具 ──────────────────────────────────────────────
  private async get<T>(path: string): Promise<T> {
    return this.request<T>('GET', path)
  }

  private async post<T>(path: string, body: Record<string, unknown>): Promise<T> {
    return this.request<T>('POST', path, body)
  }

  private async request<T>(
    method: string,
    path: string,
    body?: Record<string, unknown>,
  ): Promise<T> {
    const url =
      path.startsWith('/topapi/') || path.startsWith('https://')
        ? path.startsWith('https://')
          ? path
          : `https://oapi.dingtalk.com${path}`
        : `${DINGTALK_API}${path}`
    const accessToken = await this.corp.getAccessToken()
    try {
      return await this.doRequest<T>(url, method, accessToken, body)
    } catch (e: unknown) {
      // token 失效（v1.0 API 的特定 errcode 或 401）→ invalidate + 重试一次
      if (
        e instanceof DingtalkError &&
        (e.errcode === 40014 || e.errcode === 40015 || e.errmsg.includes('token'))
      ) {
        this.corp.invalidate()
        const newToken = await this.corp.getAccessToken()
        return this.doRequest<T>(url, method, newToken, body)
      }
      throw e
    }
  }

  private async doRequest<T>(
    url: string,
    method: string,
    accessToken: string,
    body?: Record<string, unknown>,
  ): Promise<T> {
    const headers: Record<string, string> = {
      'x-acs-dingtalk-access-token': accessToken,
    }
    if (body) headers['content-type'] = 'application/json'

    const res = await this.fetchImpl(url, {
      method,
      headers,
      ...(body ? { body: JSON.stringify(body) } : {}),
    })
    const j = (await res.json()) as Record<string, unknown>

    if (!res.ok || (j.errcode !== undefined && j.errcode !== 0)) {
      throw new DingtalkError(
        Number(j.errcode ?? res.status),
        String(j.errmsg ?? j.msg ?? j.message ?? res.statusText),
        url,
      )
    }
    return j as T
  }
}

/** 钉钉工作通知 msg 体拼装 */
function buildMsgBody(msg: WorkMessageRequest['msg']): Record<string, unknown> {
  switch (msg.type) {
    case 'text':
      return { msgtype: 'text', text: { content: msg.content.text } }
    case 'markdown':
      return { msgtype: 'markdown', markdown: { title: msg.content.title, text: msg.content.text } }
    case 'link':
      return {
        msgtype: 'link',
        link: {
          title: msg.content.title,
          text: msg.content.text,
          messageUrl: msg.content.messageUrl,
          picUrl: msg.content.picUrl,
        },
      }
    case 'oa':
      return { msgtype: 'oa', oa: msg.content }
    default:
      throw new Error(`不支持的消息类型: ${(msg as { type: string }).type}`)
  }
}