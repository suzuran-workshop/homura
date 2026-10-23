/**
 * 第三方平台能力分片抽象。
 *
 * 平台（钉钉/企微/飞书…）只实现部分能力：capabilities 数组做声明式清单，
 * supports() 类型守卫做运行时协商。App 代码：
 *   if (supports(p, 'approval')) { await p.createApprovalInstance(...) }
 *
 * OAuth 预设采用结构化契约（与 @homurajs/auth 的 OAuth2ClientConfig 鸭子类型互操作），
 * 3p 与 auth 之间零 import 依赖，避免包依赖环。
 *
 * ── 2026-10-23 契约扩展（向后兼容加法，据真实钉钉 API 实测）──
 * 原钉钉实现的 contacts 三端点（getUserDetail/listDeptUsers/listSubDepts）经实测
 * 全部指向不存在的 v1.0 路径（InvalidAction.NotFound），message 因认证传输方式错误
 * 也无法送达（topapi 只认 ?access_token= 查询参数，不认 x-acs 头）。本轮：
 *  - MessageCap 增投递回执 getSendResult/getSendProgress（asyncsend_v2 是异步任务，
 *    errcode:0 ≠ 送达；发给不存在 userid 仍返 0，只有回执暴露 invalid/failed 列表）
 *  - ContactsCap 增 getDeptDetail/getUserByMobile/listAdmins 与高层 fetchAllContacts
 *    （「一口气拉完整个通讯录」，可选携带家校通讯录；按 userid 去重、报告截断与错误）
 *  - 新增 AppsCap.listMicroApps（agentId 发现：asyncsend_v2 必需 agentId，
 *    而它无法从 appKey 反推，需列出企业应用供选择）
 * 现有 getUserDetail/listDeptUsers/listSubDepts 的**签名不变**，仅实现改指向可用端点。
 */

export type Capability = 'oauth' | 'message' | 'approval' | 'contacts' | 'apps' | 'webhook'

/** 结构化 OAuth 预设（喂给 @homurajs/auth 的 OAuth2Client.config） */
export interface OAuthPreset {
  endpoints: {
    authorizeUrl: string
    tokenUrl: string
    userinfoUrl: string
  }
  mapUser: (raw: unknown) => { sub: string; nickname?: string; avatarUrl?: string }
}

/** 推送消息能力 */
export interface MessageCap {
  sendWorkMessage(req: WorkMessageRequest): Promise<{ taskId: string }>
  /**
   * 查工作通知投递终态（实测 POST topapi/message/corpconversation/getsendresult）。
   * ⚠ asyncsend_v2 是异步任务：errcode:0 只代表「已受理」，不代表「已送达」。
   * 必须查本回执才知道哪些 userid 无效/被禁/未读，否则推送失败会被静默记成成功。
   */
  getSendResult(agentId: string, taskId: string): Promise<SendResult>
  /** 查投递进度（实测 POST topapi/message/corpconversation/getsendprogress） */
  getSendProgress(agentId: string, taskId: string): Promise<SendProgress>
}

export interface WorkMessageRequest {
  /** 钉钉 agentId 等 */
  agentId: string
  /** 平台用户 id 列表 */
  userIds: string[]
  msg: PlatformMessage
}

export type PlatformMessage =
  | { type: 'text'; content: { text: string } }
  | { type: 'markdown'; content: { title: string; text: string } }
  | { type: 'link'; content: { title: string; text: string; messageUrl: string; picUrl?: string } }
  | { type: 'oa'; content: Record<string, unknown> }

/** 工作通知投递终态（归一自 send_result；实测字段为 snake_case 的 *_list） */
export interface SendResult {
  /** 因系统/网络失败的用户（可重试） */
  failedUserIds: string[]
  /** 被企业策略禁止接收的用户 */
  forbiddenUserIds: string[]
  /** 无效 userid（不存在/已离职）——最常见，静默失败的主因 */
  invalidUserIds: string[]
  /** 无效部门 id */
  invalidDeptIds: number[]
  /** 已读用户 */
  readUserIds: string[]
  /** 未读用户 */
  unreadUserIds: string[]
}

/** 投递进度（status：0=未开始 1=处理中 2=完成，据钉钉文档） */
export interface SendProgress {
  percent: number
  status: number
}

/** 流程引擎能力 */
export interface ApprovalCap {
  listProcessCodes(req?: { name?: string; offset?: number; size?: number }): Promise<ProcessSummary[]>
  createApprovalInstance(req: CreateApprovalRequest): Promise<{ instanceId: string }>
  getApprovalInstance(instanceId: string): Promise<ApprovalInstance>
}

export interface ProcessSummary {
  processCode: string
  name: string
  description?: string
}

export interface CreateApprovalRequest {
  processCode: string
  originatorUserId: string
  formComponents: Array<{ name: string; value: string } & Record<string, unknown>>
}

export type ApprovalInstanceStatus = 'NEW' | 'RUNNING' | 'TERMINATED' | 'COMPLETED'

export interface ApprovalInstance {
  instanceId: string
  processCode: string
  status: ApprovalInstanceStatus
  result?: string
  title?: string
  originatorUserId?: string
  createTime?: string
  finishTime?: string
  tasks?: Array<Record<string, unknown>>
}

/** 通讯录能力 */
export interface ContactsCap {
  getUserDetail(userid: string): Promise<PlatformUserDetail>
  listDeptUsers(deptId: number, opts?: { cursor?: number; size?: number }): Promise<{
    users: PlatformUserDetail[]
    nextCursor?: number
    hasMore?: boolean
  }>
  listSubDepts(deptId: number): Promise<PlatformDept[]>
  /** 部门详情（实测 POST topapi/v2/department/get，含 memberCount） */
  getDeptDetail(deptId: number): Promise<PlatformDept>
  /**
   * 按手机号反查 userid（实测 POST topapi/v2/user/getbymobile → {result:{userid}}）。
   * 手机号在钉钉全局唯一，是比姓名更可靠的匹配键；查不到抛 DingtalkError(60121 等)。
   */
  getUserByMobile(mobile: string): Promise<string>
  /** 企业管理员列表（实测 POST topapi/user/listadmin，sysLevel 1=主管理员 2=子管理员） */
  listAdmins(): Promise<AdminUser[]>
  /**
   * 一口气拉完整个企业通讯录（递归部门树 + 游标翻页 + 按 userid 去重）。
   * 可选携带家校通讯录（includeFamily）——家校子树（dept_id=-7）不能用普通部门 API
   * 递归（实测 40009 不合法的部门id），须走 edu 专用接口且需 qyapi_addresslist_edu_read
   * 权限；未开通时**降级**为 family.available=false 而非抛错，企业通讯录部分照常返回。
   */
  fetchAllContacts(opts?: FetchAllContactsOptions): Promise<ContactsSnapshot>
}

export interface PlatformUserDetail {
  userid: string
  unionid?: string
  name?: string
  title?: string
  avatarUrl?: string
  mobile?: string
  email?: string
  deptIdList?: number[]
}

export interface PlatformDept {
  deptId: number
  name: string
  parentDeptId?: number
  /** 部门人数（仅 getDeptDetail / fetchAllContacts 尽力填充，listSubDepts 可能无） */
  memberCount?: number
}

export interface AdminUser {
  userid: string
  /** 1=主管理员，2=子管理员 */
  sysLevel: number
}

export interface FetchAllContactsOptions {
  /** 递归根部门，缺省 1（企业根） */
  rootDeptId?: number
  /** 是否携带家校通讯录（需 edu 权限；无则降级 family.available=false），缺省 false */
  includeFamily?: boolean
  /** 部门用户翻页 size，缺省 100（钉钉上限） */
  userPageSize?: number
  /** 部门遍历并发度，缺省 4（纯 fetch 分批，不引第三方限流库） */
  concurrency?: number
  /** 进度回调（每完成一个部门触发一次） */
  onProgress?: (p: { depts: number; users: number }) => void
}

export interface ContactsSnapshot {
  /** 遍历到的全部部门（含根） */
  depts: PlatformDept[]
  /** 全部用户，已按 userid 去重（实测同一人可属多个部门） */
  users: PlatformUserDetail[]
  /** 是否因个别部门拉取失败而未拉全（errors 非空即 true） */
  truncated: boolean
  /** 逐部门的失败原因（不中断整体，尽力而为） */
  errors: Array<{ deptId: number; message: string }>
  /** 家校通讯录（仅 includeFamily 时出现；无权限则 available=false） */
  family?: FamilyContacts
}

export interface FamilyContacts {
  available: boolean
  /** 不可用原因（如权限未开通、端点不支持） */
  reason?: string
  depts?: PlatformDept[]
  users?: PlatformUserDetail[]
}

/** 应用发现能力（asyncsend_v2 必需 agentId，且无法从 appKey 反推 → 列出企业应用供选择） */
export interface AppsCap {
  /** 列出企业已安装应用（实测 GET /v1.0/microApp/apps → {appList:[{agentId,name,...}]}） */
  listMicroApps(): Promise<MicroApp[]>
}

export interface MicroApp {
  agentId: number
  name: string
  homepageLink?: string
  pcHomepageLink?: string
  icon?: string
  desc?: string
}

/** OAuth 身份预设能力 */
export interface OAuthCap {
  oauth(): OAuthPreset
}

export interface PlatformCaps
  extends Partial<MessageCap>,
    Partial<ApprovalCap>,
    Partial<ContactsCap>,
    Partial<AppsCap>,
    Partial<OAuthCap> {}

export interface ThirdPartyPlatform extends PlatformCaps {
  readonly name: string
  readonly capabilities: readonly Capability[]
}

/** 能力协商类型守卫 */
export function supports<C extends Exclude<Capability, 'webhook'>>(
  platform: ThirdPartyPlatform,
  cap: C,
): platform is ThirdPartyPlatform & CapType<C> {
  return platform.capabilities.includes(cap)
}

export type CapType<C extends Capability> = C extends 'message'
  ? MessageCap
  : C extends 'approval'
    ? ApprovalCap
    : C extends 'contacts'
      ? ContactsCap
      : C extends 'apps'
        ? AppsCap
        : C extends 'oauth'
          ? OAuthCap
          : Record<string, never>
