/**
 * 第三方平台能力分片抽象。
 *
 * 平台（钉钉/企微/飞书…）只实现部分能力：capabilities 数组做声明式清单，
 * supports() 类型守卫做运行时协商。App 代码：
 *   if (supports(p, 'approval')) { await p.createApprovalInstance(...) }
 *
 * OAuth 预设采用结构化契约（与 @homurajs/auth 的 OAuth2ClientConfig 鸭子类型互操作），
 * 3p 与 auth 之间零 import 依赖，避免包依赖环。
 */

export type Capability = 'oauth' | 'message' | 'approval' | 'contacts' | 'webhook'

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
  }>
  listSubDepts(deptId: number): Promise<PlatformDept[]>
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
}

/** OAuth 身份预设能力 */
export interface OAuthCap {
  oauth(): OAuthPreset
}

export interface PlatformCaps extends Partial<MessageCap>, Partial<ApprovalCap>, Partial<ContactsCap>, Partial<OAuthCap> {}

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
      : C extends 'oauth'
        ? OAuthCap
        : Record<string, never>
