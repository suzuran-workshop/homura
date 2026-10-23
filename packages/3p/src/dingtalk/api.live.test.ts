/**
 * 钉钉真实凭证集成测试（live）—— 纠正桩测试假绿灯的根本手段。
 *
 * 为什么需要：api.test.ts 是 fetchImpl 桩，只能证明「代码符合我以为的契约」。
 * 2026-10-23 实测发现原实现的 contacts 三端点全部 InvalidAction.NotFound、
 * message 因认证传输方式错误发不出——而旧桩测试全绿。桩永远发现不了「端点根本不存在」
 * 这类与真实服务的偏差，只有 live 测试能。
 *
 * 门控：仅当 DINGTALK_LIVE_APP_KEY + DINGTALK_LIVE_APP_SECRET 存在时运行，否则整组 skip。
 * 凭证**只从 env 读，绝不落盘、绝不打印**（日志里 mobile 等敏感值做打码）。
 * 只跑只读接口 + 一次发给自己可控收件人的消息（可选，需 DINGTALK_LIVE_AGENT_ID + DINGTALK_LIVE_SELF_USERID）。
 *
 * 运行：
 *   DINGTALK_LIVE_APP_KEY=... DINGTALK_LIVE_APP_SECRET=... \
 *   npx vitest run packages/3p/src/dingtalk/api.live.test.ts
 */
import { describe, expect, it } from 'vitest'
import { createDingtalkPlatform } from './index.js'
import { supports } from '../index.js'

const APP_KEY = process.env.DINGTALK_LIVE_APP_KEY
const APP_SECRET = process.env.DINGTALK_LIVE_APP_SECRET
const AGENT_ID = process.env.DINGTALK_LIVE_AGENT_ID
const SELF_USERID = process.env.DINGTALK_LIVE_SELF_USERID

const live = Boolean(APP_KEY && APP_SECRET)
const d = live ? describe : describe.skip

function mask(s: string | undefined): string {
  if (!s) return '(无)'
  return s.length <= 4 ? '****' : `${s.slice(0, 3)}****${s.slice(-2)}`
}

d('钉钉 live 集成（真实凭证）', () => {
  const platform = createDingtalkPlatform({
    appKey: APP_KEY!,
    appSecret: APP_SECRET!,
    agentId: AGENT_ID,
  })

  it('capabilities 含 message/approval/contacts/apps', () => {
    expect(platform.capabilities).toEqual(expect.arrayContaining(['message', 'approval', 'contacts', 'apps']))
  })

  it('listMicroApps：真实返回应用列表（v1.0 header 认证可达）', async () => {
    if (!supports(platform, 'apps')) throw new Error('apps 能力未声明')
    const apps = await platform.listMicroApps()
    expect(Array.isArray(apps)).toBe(true)
    console.log(`  [live] listMicroApps → ${apps.length} 个应用；样例：`, apps.slice(0, 3).map((a) => `${a.name}(${a.agentId})`).join(', '))
    if (AGENT_ID) {
      expect(apps.some((a) => String(a.agentId) === AGENT_ID), `应含 agentId ${AGENT_ID}`).toBe(true)
    }
  })

  it('fetchAllContacts：递归部门树 + 按 userid 去重 + 跳过家校保留子树（topapi query 认证可达）', async () => {
    if (!supports(platform, 'contacts')) throw new Error('contacts 能力未声明')
    const snap = await platform.fetchAllContacts({ concurrency: 2, includeFamily: true })
    // 组织数据会变，故只断言结构性不变量，具体数字打印出来人工核对
    expect(snap.depts.length, '应拉到部门').toBeGreaterThan(0)
    expect(snap.users.length, '应拉到用户').toBeGreaterThan(0)
    expect(snap.depts.every((dpt) => dpt.deptId > 0), '企业通讯录不应含负数保留子树（家校 -7 应被跳过）').toBe(true)
    const ids = snap.users.map((u) => u.userid)
    expect(new Set(ids).size, 'userid 应去重').toBe(ids.length)
    expect(snap.truncated, `不应有部门拉取失败：${JSON.stringify(snap.errors)}`).toBe(false)
    console.log(`  [live] fetchAllContacts → ${snap.depts.length} 部门 / ${snap.users.length} 用户（去重后）`)

    // 家校：未开通 qyapi_addresslist_edu_read 时应降级 available=false 而非抛错
    expect(snap.family, 'includeFamily 应返回 family 字段').toBeDefined()
    console.log(`  [live] 家校通讯录 → available=${snap.family?.available}${snap.family?.reason ? ` reason=${snap.family.reason}` : ''}`)
  })

  it('getUserDetail + getUserByMobile 闭环（拿到的 mobile 能反查回同一 userid）', async () => {
    if (!supports(platform, 'contacts')) throw new Error('contacts 能力未声明')
    const snap = await platform.fetchAllContacts({ concurrency: 2 })
    const withMobile = snap.users.find((u) => u.mobile)
    if (!withMobile) {
      console.log('  [live] 无带 mobile 的用户，跳过闭环')
      return
    }
    const detail = await platform.getUserDetail(withMobile.userid)
    expect(detail.userid).toBe(withMobile.userid)
    console.log(`  [live] getUserDetail(${withMobile.userid}) → name=${detail.name ?? '?'} mobile=${mask(detail.mobile)}`)
    const back = await platform.getUserByMobile(detail.mobile!)
    expect(back, '手机号反查应命中同一 userid').toBe(withMobile.userid)
    console.log(`  [live] getUserByMobile(${mask(detail.mobile)}) → ${back} ✓ 闭环`)
  })

  it('listSubDepts + getDeptDetail + listAdmins 可达', async () => {
    if (!supports(platform, 'contacts')) throw new Error('contacts 能力未声明')
    const subs = await platform.listSubDepts(1)
    expect(Array.isArray(subs)).toBe(true)
    console.log(`  [live] listSubDepts(1) → ${subs.length} 个子部门：`, subs.map((s) => `${s.name}(${s.deptId})`).join(', '))
    // getDeptDetail 用正数部门（-7 家校子树普通 API 不可读）
    const normal = subs.find((s) => s.deptId > 0)
    if (normal) {
      const dd = await platform.getDeptDetail(normal.deptId)
      expect(dd.deptId).toBe(normal.deptId)
      console.log(`  [live] getDeptDetail(${normal.deptId}) → name=${dd.name} memberCount=${dd.memberCount ?? '?'}`)
    }
    const admins = await platform.listAdmins()
    expect(Array.isArray(admins)).toBe(true)
    console.log(`  [live] listAdmins → ${admins.length} 个管理员`)
  })

  it('审批端点可达（预期 403 权限错误，而非 NotFound —— 证明端点与认证都对）', async () => {
    if (!supports(platform, 'approval')) throw new Error('approval 能力未声明')
    // getApprovalInstance：无 Workflow.Instance.Read 权限时应 403，端点存在
    let approvalReachable = false
    try {
      await platform.getApprovalInstance('__probe__')
      approvalReachable = true // 有权限且实例存在（不太可能），也算可达
    } catch (e: unknown) {
      const err = e as { errcode?: number; code?: string; message?: string }
      const notFound = /NotFound|InvalidAction/i.test(String(err.code ?? err.message ?? ''))
      approvalReachable = !notFound
      console.log(`  [live] getApprovalInstance → errcode=${err.errcode} code=${err.code ?? '-'}`)
    }
    expect(approvalReachable, '审批端点应可达（403/业务错误均可，NotFound 不行）').toBe(true)
  })

  // 发消息有副作用，仅当显式提供 AGENT_ID + SELF_USERID 时跑，且只发给自己
  const canSend = Boolean(AGENT_ID && SELF_USERID && supports(platform, 'message'))
  const sendD = canSend ? it : it.skip

  sendD('sendWorkNotice + getSendResult：真发一条给自己并确认送达（有副作用，需显式 opt-in）', async () => {
    const msgPlatform = platform
    if (!supports(msgPlatform, 'message')) throw new Error('message 能力未声明')
    const { taskId } = await msgPlatform.sendWorkMessage({
      agentId: AGENT_ID!,
      userIds: [SELF_USERID!],
      msg: { type: 'markdown', content: { title: '3p live 验证', text: '# @homurajs/3p 集成验证\n这是一条来自 live 测试的钉钉工作通知。' } },
    })
    expect(taskId).toBeTruthy()
    console.log(`  [live] sendWorkNotice → taskId=${taskId}`)
    // asyncsend 是异步任务，轮询回执确认送达（errcode:0 只代表已受理）
    let result = await msgPlatform.getSendResult(AGENT_ID!, taskId)
    for (let i = 0; i < 10 && result.invalidUserIds.length === 0 && result.readUserIds.length === 0 && result.unreadUserIds.length === 0; i++) {
      await new Promise((r) => setTimeout(r, 500))
      result = await msgPlatform.getSendResult(AGENT_ID!, taskId)
    }
    console.log(`  [live] getSendResult → read=${result.readUserIds.length} unread=${result.unreadUserIds.length} invalid=${result.invalidUserIds.length} failed=${result.failedUserIds.length}`)
    const delivered = result.readUserIds.includes(SELF_USERID!) || result.unreadUserIds.includes(SELF_USERID!)
    expect(result.invalidUserIds, '自己的 userid 不应无效').not.toContain(SELF_USERID!)
    expect(delivered, '消息应送达自己（read 或 unread）').toBe(true)
  })
})
