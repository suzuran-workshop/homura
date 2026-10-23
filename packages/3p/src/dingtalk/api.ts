/**
 * 钉钉 API 统一请求器。
 *
 * ── 2026-10-23 重写（据真实凭证 + 真实钉钉 API 实测）──
 * 原实现的三处致命缺陷，全部经实测复现并修复：
 *
 *  1. **认证传输按 host 分流**（根因）。钉钉两套 API 认证方式不同：
 *     - `oapi.dingtalk.com/topapi/*`（旧版）：**只认 `?access_token=` 查询参数**，
 *       仅传 x-acs 头 → `errcode:88 access_token is blank`（实测）。
 *     - `api.dingtalk.com/v1.0/*`（新版）：认 `x-acs-dingtalk-access-token` 头。
 *     原实现一律只放头 → message（topapi）永远发不出，approval（v1.0）偶然对。
 *
 *  2. **错误约定按 host 分流**。两套 API 成功/失败判据完全不同：
 *     - topapi：HTTP 200 也可能是错误，判据是 `errcode !== 0`，数据多在 `result`。
 *     - v1.0：错误走 HTTP 4xx，body 是 `{code:'InvalidAction.NotFound', message}`（字符串 code，无 errcode）。
 *     原 doRequest 只认 errcode → v1.0 的错误（如权限 403）判不出，且 403 权限错误
 *     含 "AccessToken" 子串会被旧的 `errmsg.includes('token')` 误判为 token 失效而重试。
 *     现改为精确 errcode/status 集合触发重试，403 权限错误不重试。
 *
 *  3. **端点修正**（原三个 contacts 端点实测全部 InvalidAction.NotFound）：
 *     - getUserDetail：`GET v1.0/contact/users/{id}`（该路径键其实是 unionId）→ `POST topapi/v2/user/get`（按 userid）
 *     - listDeptUsers：`POST v1.0/contact/users/{deptId}/users`（不存在）→ `POST topapi/v2/user/list`
 *     - listSubDepts：`GET v1.0/contact/departments/{deptId}`（不存在）→ `POST topapi/v2/department/listsub`
 *     - listProcessCodes：`POST v1.0/workflow/processCentricV2/list`（不存在）→ `GET v1.0/workflow/processCentres/schemaNames/processCodes`
 *
 * 实测已确认可用的端点（2026-10-23，真实企业）：gettoken、topapi/v2/user/{list,get,getbymobile}、
 * topapi/v2/department/{listsub,get}、topapi/user/listadmin、topapi/message/corpconversation/
 * {asyncsend_v2,getsendresult,getsendprogress}、v1.0/microApp/apps。
 * 端点存在但成功响应形状因缺权限未实测（返回 403 而非 NotFound，证明路径正确）：
 * v1.0/workflow/processInstances（需 Workflow.Instance.Read）、
 * v1.0/workflow/processCentres/schemaNames/processCodes（需 Workflow.Form.Read）、
 * v1.0/edu/teachers（需 qyapi_addresslist_edu_read）—— 这些的解析为 best-effort，已在方法处标注。
 */
import type {
  ApprovalInstance,
  CreateApprovalRequest,
  ProcessSummary,
  PlatformDept,
  PlatformUserDetail,
  WorkMessageRequest,
  SendResult,
  SendProgress,
  AdminUser,
  MicroApp,
  ContactsSnapshot,
  FetchAllContactsOptions,
  FamilyContacts,
} from '../index.js'
import type { CorpTokenManager } from './corp-token.js'

const DINGTALK_V1 = 'https://api.dingtalk.com'
const DINGTALK_OAPI = 'https://oapi.dingtalk.com'

/** token 失效的精确信号（不用 errmsg 模糊匹配，避免 403 权限错误里含 "AccessToken" 被误判） */
const TOKEN_INVALID_ERRCODES = new Set([
  40014, // 不合法的 access_token
  40015, // access_token 已过期
  88, // access_token is blank（sub_code 40000）
  401, // v1.0 未认证（HTTP status）
])

export class DingtalkError extends Error {
  constructor(
    public readonly errcode: number,
    public readonly errmsg: string,
    public readonly url?: string,
    /** v1.0 的字符串错误码（如 'InvalidAction.NotFound'）；topapi 无此字段 */
    public readonly code?: string,
  ) {
    super(`dingtalk ${code ? `${code} ` : ''}${errcode}: ${errmsg}`)
    this.name = 'DingtalkError'
  }
}

export interface DingtalkClientOptions {
  fetchImpl?: typeof fetch
  timeoutMs?: number
}

/** 钉钉 topapi 用户原始形状（snake_case）→ PlatformUserDetail（camelCase） */
interface RawTopapiUser {
  userid: string
  unionid?: string
  name?: string
  title?: string
  avatar?: string
  mobile?: string
  email?: string
  dept_id_list?: number[]
}

function normalizeUser(u: RawTopapiUser): PlatformUserDetail {
  return {
    userid: u.userid,
    unionid: u.unionid,
    name: u.name,
    title: u.title,
    avatarUrl: u.avatar,
    mobile: u.mobile,
    email: u.email,
    deptIdList: u.dept_id_list,
  }
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
   * POST topapi/message/corpconversation/asyncsend_v2（旧版通用端点；v1.0 新端点需白名单）。
   * msg 四种形状（text/markdown/link/oa）实测均通过校验。
   * ⚠ 返回 taskId 只代表「已受理」，送达与否须查 getSendResult。
   */
  async sendWorkNotice(req: WorkMessageRequest): Promise<{ taskId: string }> {
    // 绝不过滤空应发人（钉钉返回 InvalidParameter，不吞信息不吞错误）。
    if (!req.userIds || req.userIds.length === 0) {
      throw new DingtalkError(-1, 'userIds 不能为空')
    }
    const data = await this.oapi<{ task_id: number | string }>('/topapi/message/corpconversation/asyncsend_v2', {
      agent_id: Number(req.agentId),
      userid_list: req.userIds.join(','),
      msg: buildMsgBody(req.msg),
    })
    return { taskId: String(data.task_id) }
  }

  /**
   * 查投递终态。实测：发给不存在的 userid，asyncsend_v2 仍返 errcode:0，
   * 只有本回执的 invalid_user_id_list 才暴露失败 —— 不查它，推送失败会被静默记成成功。
   */
  async getSendResult(agentId: string, taskId: string): Promise<SendResult> {
    const data = await this.oapi<{
      send_result?: {
        failed_user_id_list?: string[]
        forbidden_list?: string[]
        invalid_user_id_list?: string[]
        invalid_dept_id_list?: number[]
        read_user_id_list?: string[]
        unread_user_id_list?: string[]
      }
    }>('/topapi/message/corpconversation/getsendresult', {
      agent_id: Number(agentId),
      task_id: Number(taskId),
    })
    const r = data.send_result ?? {}
    return {
      failedUserIds: r.failed_user_id_list ?? [],
      forbiddenUserIds: r.forbidden_list ?? [],
      invalidUserIds: r.invalid_user_id_list ?? [],
      invalidDeptIds: r.invalid_dept_id_list ?? [],
      readUserIds: r.read_user_id_list ?? [],
      unreadUserIds: r.unread_user_id_list ?? [],
    }
  }

  /** 查投递进度。实测 progress={progress_in_percent, status}（status 2=完成）。 */
  async getSendProgress(agentId: string, taskId: string): Promise<SendProgress> {
    const data = await this.oapi<{ progress?: { progress_in_percent?: number; status?: number } }>(
      '/topapi/message/corpconversation/getsendprogress',
      { agent_id: Number(agentId), task_id: Number(taskId) },
    )
    return { percent: data.progress?.progress_in_percent ?? 0, status: data.progress?.status ?? 0 }
  }

  // ── 审批 ──────────────────────────────────────────────────
  /**
   * GET v1.0/workflow/processCentres/schemaNames/processCodes。
   * ⚠ 端点实测存在（返回 403 需 Workflow.Form.Read，非 NotFound），但成功响应形状因缺权限未实测，
   * 解析为 best-effort（兼容 {result:{list}} 与 {list} 两种常见包裹）。权限开通后应实测校准。
   */
  async listProcessCodes(
    req?: { name?: string; offset?: number; size?: number },
  ): Promise<ProcessSummary[]> {
    const query: Record<string, string> = {}
    if (req?.name) query['name'] = req.name
    if (req?.offset !== undefined) query['offset'] = String(req.offset)
    if (req?.size !== undefined) query['size'] = String(req.size)
    const data = await this.v1<Record<string, unknown>>('GET', '/v1.0/workflow/processCentres/schemaNames/processCodes', { query })
    const raw = pickList(data)
    return raw.map((p) => ({
      processCode: String(p['processCode'] ?? ''),
      name: String(p['name'] ?? ''),
      description: p['description'] !== undefined ? String(p['description']) : undefined,
    }))
  }

  /**
   * POST v1.0/workflow/processInstances。端点实测存在（403 需权限），成功形状未实测，best-effort。
   */
  async createApprovalInstance(req: CreateApprovalRequest): Promise<{ instanceId: string }> {
    const data = await this.v1<{ instanceId?: string }>('POST', '/v1.0/workflow/processInstances', {
      body: {
        originatorUserId: req.originatorUserId,
        processCode: req.processCode,
        formComponents: req.formComponents.map((f) => ({ name: f.name, value: f.value })),
      },
    })
    return { instanceId: String(data.instanceId ?? '') }
  }

  /**
   * GET v1.0/workflow/processInstances?processInstanceId={id}（官方 SDK GetProcessInstance 形状：
   * instanceId 走 **query 参数**，非路径参数——2026-10-23 live 实测：路径参数形式 → InvalidAction.NotFound）。
   * 端点存在（403 需 Workflow.Instance.Read），成功形状未实测，best-effort。
   */
  async getApprovalInstance(instanceId: string): Promise<ApprovalInstance> {
    const data = await this.v1<Record<string, unknown>>('GET', '/v1.0/workflow/processInstances', {
      query: { processInstanceId: instanceId },
    })
    return {
      instanceId: String(data['instanceId'] ?? instanceId),
      processCode: String(data['processCode'] ?? ''),
      status: (data['status'] as ApprovalInstance['status']) ?? 'RUNNING',
      result: data['result'] !== undefined ? String(data['result']) : undefined,
      title: data['title'] !== undefined ? String(data['title']) : undefined,
      originatorUserId: data['originatorUserId'] !== undefined ? String(data['originatorUserId']) : undefined,
      createTime: data['createTime'] !== undefined ? String(data['createTime']) : undefined,
      finishTime: data['finishTime'] !== undefined ? String(data['finishTime']) : undefined,
      tasks: Array.isArray(data['tasks']) ? (data['tasks'] as Array<Record<string, unknown>>) : undefined,
    }
  }

  // ── 通讯录（topapi v2，实测可用）──────────────────────────
  /** POST topapi/v2/user/get（按 userid；数据在 result）。实测 errcode:60121=找不到用户。 */
  async getUserDetail(userid: string): Promise<PlatformUserDetail> {
    const data = await this.oapi<{ result?: RawTopapiUser }>('/topapi/v2/user/get', { userid })
    if (!data.result) throw new DingtalkError(60121, '找不到该用户', undefined)
    return normalizeUser(data.result)
  }

  /** POST topapi/v2/user/list（游标翻页；数据在 result.{list,has_more,next_cursor}）。 */
  async listDeptUsers(
    deptId: number,
    opts?: { cursor?: number; size?: number },
  ): Promise<{ users: PlatformUserDetail[]; nextCursor?: number; hasMore?: boolean }> {
    const data = await this.oapi<{
      result?: { has_more?: boolean; next_cursor?: number; list?: RawTopapiUser[] }
    }>('/topapi/v2/user/list', {
      dept_id: deptId,
      cursor: opts?.cursor ?? 0,
      size: opts?.size ?? 100,
    })
    const r = data.result ?? {}
    return {
      users: (r.list ?? []).map(normalizeUser),
      nextCursor: r.next_cursor,
      hasMore: r.has_more,
    }
  }

  /** POST topapi/v2/department/listsub（数据在 result 数组）。实测家校子树 dept_id=-7 → 40009。 */
  async listSubDepts(deptId: number): Promise<PlatformDept[]> {
    const data = await this.oapi<{ result?: Array<{ dept_id: number; name: string; parent_id?: number }> }>(
      '/topapi/v2/department/listsub',
      { dept_id: deptId },
    )
    return (data.result ?? []).map((d) => ({ deptId: d.dept_id, name: d.name, parentDeptId: d.parent_id }))
  }

  /** POST topapi/v2/department/get（数据在 result，含 member_count）。 */
  async getDeptDetail(deptId: number): Promise<PlatformDept> {
    const data = await this.oapi<{
      result?: { dept_id: number; name: string; parent_id?: number; member_count?: number }
    }>('/topapi/v2/department/get', { dept_id: deptId })
    const r = data.result
    if (!r) throw new DingtalkError(40009, '部门不存在', undefined)
    return { deptId: r.dept_id, name: r.name, parentDeptId: r.parent_id, memberCount: r.member_count }
  }

  /** POST topapi/v2/user/getbymobile（数据在 result.userid）。实测 errcode:40104=号码无效。 */
  async getUserByMobile(mobile: string): Promise<string> {
    const data = await this.oapi<{ result?: { userid: string } }>('/topapi/v2/user/getbymobile', { mobile })
    if (!data.result?.userid) throw new DingtalkError(60121, '手机号未匹配到用户', undefined)
    return data.result.userid
  }

  /** POST topapi/user/listadmin（数据在 result 数组，含 sys_level）。 */
  async listAdmins(): Promise<AdminUser[]> {
    const data = await this.oapi<{ result?: Array<{ userid: string; sys_level: number }> }>('/topapi/user/listadmin', {})
    return (data.result ?? []).map((a) => ({ userid: a.userid, sysLevel: a.sys_level }))
  }

  // ── 应用发现（v1.0，实测可用）─────────────────────────────
  /** GET v1.0/microApp/apps（数据在 appList）。asyncsend_v2 必需 agentId，用它发现。 */
  async listMicroApps(): Promise<MicroApp[]> {
    const data = await this.v1<{ appList?: Array<Record<string, unknown>> }>('GET', '/v1.0/microApp/apps')
    return (data.appList ?? []).map((a) => ({
      agentId: Number(a['agentId']),
      name: String(a['name'] ?? ''),
      homepageLink: a['homepageLink'] !== undefined ? String(a['homepageLink']) : undefined,
      pcHomepageLink: a['pcHomepageLink'] !== undefined ? String(a['pcHomepageLink']) : undefined,
      icon: a['icon'] !== undefined ? String(a['icon']) : undefined,
      desc: a['desc'] !== undefined ? String(a['desc']) : undefined,
    }))
  }

  // ── 全量通讯录（高层编排）─────────────────────────────────
  /**
   * 一口气拉完整个企业通讯录：BFS 递归部门树 + 每部门游标翻页 + 按 userid 去重。
   * 个别部门失败不中断整体（记入 errors，truncated=true）。可选携带家校通讯录（降级安全）。
   */
  async fetchAllContacts(opts: FetchAllContactsOptions = {}): Promise<ContactsSnapshot> {
    const root = opts.rootDeptId ?? 1
    const concurrency = Math.max(1, opts.concurrency ?? 4)
    const pageSize = opts.userPageSize ?? 100

    const depts: PlatformDept[] = []
    const users = new Map<string, PlatformUserDetail>()
    const errors: Array<{ deptId: number; message: string }> = []
    const seen = new Set<number>([root])

    // 根部门自身详情（listSubDepts 只返回子部门，不含根）
    try {
      depts.push(await this.getDeptDetail(root))
    } catch (e) {
      errors.push({ deptId: root, message: errMessage(e) })
    }

    const queue: number[] = [root]
    while (queue.length > 0) {
      const batch = queue.splice(0, concurrency)
      await mapLimit(batch, concurrency, async (deptId) => {
        // 子部门
        try {
          for (const sub of await this.listSubDepts(deptId)) {
            if (seen.has(sub.deptId)) continue
            // 跳过负数 dept_id（钉钉保留子树，如「家校通讯录」-7）：普通部门 API 处理不了
            // （实测 listsub(-7) → 40009 illegal deptId），家校须走 edu 专用接口（probeFamilyContacts）。
            if (sub.deptId < 0) continue
            seen.add(sub.deptId)
            depts.push(sub)
            queue.push(sub.deptId)
          }
        } catch (e) {
          errors.push({ deptId, message: errMessage(e) })
        }
        // 部门用户（游标翻页）
        try {
          let cursor = 0
          for (;;) {
            const page = await this.listDeptUsers(deptId, { cursor, size: pageSize })
            for (const u of page.users) users.set(u.userid, u)
            if (!page.hasMore || page.nextCursor === undefined) break
            cursor = page.nextCursor
          }
        } catch (e) {
          errors.push({ deptId, message: errMessage(e) })
        }
        opts.onProgress?.({ depts: depts.length, users: users.size })
      })
    }

    const snapshot: ContactsSnapshot = {
      depts,
      users: [...users.values()],
      truncated: errors.length > 0,
      errors,
    }
    if (opts.includeFamily) snapshot.family = await this.probeFamilyContacts()
    return snapshot
  }

  /**
   * 家校通讯录探测（best-effort + 降级）。
   * 家校子树（dept_id=-7）不能用普通部门 API 递归（实测 40009），须走 edu 专用接口。
   * GET v1.0/edu/teachers 参数为 pageNumber/pageSize（官方 SDK EduTeacherList 实测）。
   * 缺 qyapi_addresslist_edu_read 权限 → 403；无权限/不可用时**降级**为 available=false（不抛错），
   * 企业通讯录部分不受影响。
   * ⚠ 成功路径（有权限）的响应形状因当前无权限未实测，解析为 best-effort，待权限开通后校准。
   */
  private async probeFamilyContacts(): Promise<FamilyContacts> {
    try {
      const data = await this.v1<Record<string, unknown>>('GET', '/v1.0/edu/teachers', {
        query: { pageNumber: '1', pageSize: '100' },
      })
      const list = pickList(data)
      if (list.length === 0) {
        return { available: true, users: [], reason: 'edu 响应未识别出教师列表（成功路径待实测校准）' }
      }
      return {
        available: true,
        users: list.map((t) => ({
          userid: String(t['userid'] ?? t['userId'] ?? ''),
          name: t['name'] !== undefined ? String(t['name']) : undefined,
          mobile: t['mobile'] !== undefined ? String(t['mobile']) : undefined,
        })).filter((u) => u.userid),
      }
    } catch (e) {
      // edu 端点失败最常见原因是未开通 qyapi_addresslist_edu_read 权限。钉钉可能返回明确的
      // 403 Forbidden，也可能返回模糊的 unknownError（2026-10-23 实测：本应用即返回后者）。
      // 故 reason 一律「透传钉钉原始错误 + 权限申请指引」，既诚实又可自助排障。
      const msg = errMessage(e)
      return {
        available: false,
        reason: `家校通讯录不可用（钉钉返回：${msg}）。最常见原因是未开通 qyapi_addresslist_edu_read 权限，请在钉钉开放平台为应用申请该权限后重试。`,
      }
    }
  }

  // ── 内部：topapi（oapi.dingtalk.com，query 认证 + errcode 判错）──
  private async oapi<T>(path: string, body: Record<string, unknown>): Promise<T> {
    return this.request<T>('topapi', 'POST', path, { body })
  }

  // ── 内部：v1.0（api.dingtalk.com，header 认证 + HTTP status 判错）──
  private async v1<T>(
    method: 'GET' | 'POST',
    path: string,
    opts?: { body?: Record<string, unknown>; query?: Record<string, string> },
  ): Promise<T> {
    return this.request<T>('v1', method, path, opts)
  }

  private async request<T>(
    api: 'topapi' | 'v1',
    method: string,
    path: string,
    opts?: { body?: Record<string, unknown>; query?: Record<string, string> },
  ): Promise<T> {
    const accessToken = await this.corp.getAccessToken()
    try {
      return await this.doRequest<T>(api, method, path, accessToken, opts)
    } catch (e: unknown) {
      // 仅精确的 token 失效信号才 invalidate + 重试一次（403 权限错误不在此列，避免无谓重试）
      if (e instanceof DingtalkError && TOKEN_INVALID_ERRCODES.has(e.errcode)) {
        this.corp.invalidate()
        const newToken = await this.corp.getAccessToken()
        return this.doRequest<T>(api, method, path, newToken, opts)
      }
      throw e
    }
  }

  private async doRequest<T>(
    api: 'topapi' | 'v1',
    method: string,
    path: string,
    accessToken: string,
    opts?: { body?: Record<string, unknown>; query?: Record<string, string> },
  ): Promise<T> {
    const query = new URLSearchParams(opts?.query ?? {})
    // topapi 认证走 query 参数；v1.0 走 header（实测差异，见文件头）
    if (api === 'topapi') query.set('access_token', accessToken)
    const qs = query.toString()
    const url = `${api === 'topapi' ? DINGTALK_OAPI : DINGTALK_V1}${path}${qs ? `?${qs}` : ''}`

    const headers: Record<string, string> = {}
    if (api === 'v1') headers['x-acs-dingtalk-access-token'] = accessToken
    if (opts?.body) headers['content-type'] = 'application/json'

    let res: Response
    try {
      res = await this.fetchImpl(url, {
        method,
        headers,
        ...(opts?.body ? { body: JSON.stringify(opts.body) } : {}),
        signal: AbortSignal.timeout(this.timeoutMs),
      })
    } catch (e: unknown) {
      // 超时（AbortSignal.timeout）或网络错误 → 归一为 DingtalkError（errcode -1，不触发 token 重试）
      throw new DingtalkError(-1, e instanceof Error ? e.message : String(e), url)
    }

    const j = (await res.json().catch(() => ({}))) as Record<string, unknown>

    if (api === 'topapi') {
      // topapi：HTTP 200 也可能是错误，判据是 errcode
      const errcode = j['errcode']
      if (errcode !== undefined && errcode !== 0) {
        throw new DingtalkError(Number(errcode), String(j['errmsg'] ?? ''), url)
      }
      return j as T
    }
    // v1.0：非 2xx 即错误，body 是 {code, message}
    if (!res.ok) {
      throw new DingtalkError(res.status, String(j['message'] ?? j['errmsg'] ?? res.statusText), url, j['code'] !== undefined ? String(j['code']) : undefined)
    }
    return j as T
  }
}

/** 从 v1.0 响应里尽力取出列表（兼容 {list} / {result:{list}} / 顶层数组，best-effort） */
function pickList(data: Record<string, unknown>): Array<Record<string, unknown>> {
  if (Array.isArray(data)) return data as Array<Record<string, unknown>>
  const result = data['result']
  const candidate = Array.isArray(data['list'])
    ? data['list']
    : result && typeof result === 'object' && Array.isArray((result as Record<string, unknown>)['list'])
      ? (result as Record<string, unknown>)['list']
      : undefined
  return (candidate ?? []) as Array<Record<string, unknown>>
}

function errMessage(e: unknown): string {
  if (e instanceof DingtalkError) return e.code ? `${e.errmsg} (${e.code})` : e.errmsg
  return e instanceof Error ? e.message : String(e)
}

/** 分批并发 map（不引第三方限流库；纯 fetch 场景足够） */
async function mapLimit<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  let i = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++
      await fn(items[idx] as T)
    }
  })
  await Promise.all(workers)
}

/** 钉钉工作通知 msg 体拼装（四种形状实测均通过 asyncsend_v2 校验） */
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
