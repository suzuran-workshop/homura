import { describe, expect, it, vi } from 'vitest'
import { CorpTokenManager } from './corp-token.js'
import { DingtalkClient, DingtalkError } from './api.js'
import { createDingtalkPlatform } from './index.js'
import { supports } from '../index.js'

interface CapturedCall {
  url: string
  method: string
  headers: Record<string, string>
  body?: unknown
}

/** 通用桩：捕获请求，按 URL 分派固定响应 */
function stubApi(responses: Record<string, unknown>, opts?: { failFirst?: boolean }) {
  const calls: CapturedCall[] = []
  let firstDone = false
  const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url)
    calls.push({
      url: u,
      method: init?.method ?? 'GET',
      headers: (init?.headers ?? {}) as Record<string, string>,
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    })
    if (u.includes('gettoken')) {
      return new Response(JSON.stringify({ access_token: 'corp-tok', expires_in: 7200 }), { status: 200 })
    }
    // token 失效重试场景：首次命中业务端点回 40014
    if (opts?.failFirst && !firstDone && !u.includes('gettoken')) {
      firstDone = true
      return new Response(JSON.stringify({ errcode: 40014, errmsg: 'invalid access_token' }), { status: 200 })
    }
    // 匹配最近的业务响应（按 path 尾段）
    for (const [key, val] of Object.entries(responses)) {
      if (u.includes(key)) return new Response(JSON.stringify(val), { status: 200, headers: { 'content-type': 'application/json' } })
    }
    return new Response(JSON.stringify({}), { status: 200 })
  })
  return { calls, fetchImpl: fetchImpl as unknown as typeof fetch }
}

function makeClient(stub: ReturnType<typeof stubApi>) {
  const corp = new CorpTokenManager({ appKey: 'k', appSecret: 's', fetchImpl: stub.fetchImpl })
  return new DingtalkClient(corp, { fetchImpl: stub.fetchImpl })
}

describe('DingtalkClient — 工作通知', () => {
  it('asyncsend_v2：agent_id/userid_list/msg 拼装 + 返回 taskId', async () => {
    const stub = stubApi({ asyncsend_v2: { task_id: 88888 } })
    const c = makeClient(stub)
    const r = await c.sendWorkNotice({
      agentId: '12345',
      userIds: ['u1', 'u2'],
      msg: { type: 'markdown', content: { title: '值班', text: '# 张三' } },
    })
    expect(r).toEqual({ taskId: '88888' })
    const call = stub.calls.find((x) => x.url.includes('asyncsend_v2'))!
    expect(call.body).toMatchObject({ agent_id: 12345, userid_list: 'u1,u2' })
    expect((call.body as { msg: unknown }).msg).toMatchObject({
      msgtype: 'markdown',
      markdown: { title: '值班', text: '# 张三' },
    })
    // 企业 token 头注入
    expect(call.headers['x-acs-dingtalk-access-token']).toBe('corp-tok')
  })

  it('空 userIds → 抛 DingtalkError（不吞信息）', async () => {
    const stub = stubApi({})
    const c = makeClient(stub)
    await expect(
      c.sendWorkNotice({ agentId: '1', userIds: [], msg: { type: 'text', content: { text: 'x' } } }),
    ).rejects.toThrow(DingtalkError)
  })

  it('text/link/oa 消息体映射正确', async () => {
    const stub = stubApi({ asyncsend_v2: { task_id: 1 } })
    const c = makeClient(stub)
    await c.sendWorkNotice({ agentId: '1', userIds: ['u'], msg: { type: 'text', content: { text: 'hi' } } })
    await c.sendWorkNotice({
      agentId: '1', userIds: ['u'],
      msg: { type: 'link', content: { title: 't', text: 'x', messageUrl: 'http://a', picUrl: 'http://p' } },
    })
    await c.sendWorkNotice({ agentId: '1', userIds: ['u'], msg: { type: 'oa', content: { head: { text: 'OA' } } } })
    const msgs = stub.calls.filter((x) => x.url.includes('asyncsend_v2')).map((x) => (x.body as { msg: { msgtype: string } }).msg.msgtype)
    expect(msgs).toEqual(['text', 'link', 'oa'])
  })
})

describe('DingtalkClient — 审批', () => {
  it('listProcessCodes 映射 result.list', async () => {
    const stub = stubApi({
      processCentricV2: { result: { list: [{ processCode: 'PROC-1', name: '请假', description: 'd' }] } },
    })
    const c = makeClient(stub)
    const r = await c.listProcessCodes({ name: '请假' })
    expect(r).toEqual([{ processCode: 'PROC-1', name: '请假', description: 'd' }])
    expect(stub.calls.find((x) => x.url.includes('processCentricV2/list'))!.body).toMatchObject({ approvalName: '请假' })
  })

  it('createApprovalInstance 提交表单组件 + 返回 instanceId', async () => {
    const stub = stubApi({ 'workflow/processInstances': { instanceId: 'inst-9' } })
    const c = makeClient(stub)
    const r = await c.createApprovalInstance({
      processCode: 'PROC-1',
      originatorUserId: 'u0',
      formComponents: [{ name: '天数', value: '2' }],
    })
    expect(r).toEqual({ instanceId: 'inst-9' })
    const call = stub.calls.find((x) => x.url.endsWith('/v1.0/workflow/processInstances'))!
    expect(call.method).toBe('POST')
    expect(call.body).toMatchObject({ originatorUserId: 'u0', processCode: 'PROC-1', formComponents: [{ name: '天数', value: '2' }] })
  })

  it('getApprovalInstance 详情映射', async () => {
    const stub = stubApi({ 'processInstances/inst-1': { instanceId: 'inst-1', processCode: 'P', status: 'COMPLETED', result: 'agree' } })
    const c = makeClient(stub)
    const r = await c.getApprovalInstance('inst-1')
    expect(r).toMatchObject({ instanceId: 'inst-1', status: 'COMPLETED', result: 'agree' })
  })
})

describe('DingtalkClient — 通讯录', () => {
  it('getUserDetail：avatar→avatarUrl 归一', async () => {
    const stub = stubApi({ 'contact/users/u1': { userid: 'u1', name: '张三', avatar: 'http://a', unionid: 'un' } })
    const c = makeClient(stub)
    const r = await c.getUserDetail('u1')
    expect(r).toMatchObject({ userid: 'u1', name: '张三', avatarUrl: 'http://a', unionid: 'un' })
  })

  it('listDeptUsers：游标 + nextCursor', async () => {
    const stub = stubApi({ 'users/7/users': { hasMore: true, nextCursor: 20, list: [{ userid: 'u', name: 'n', avatar: 'av' }] } })
    const c = makeClient(stub)
    const r = await c.listDeptUsers(7, { cursor: 0, size: 20 })
    expect(r.nextCursor).toBe(20)
    expect(r.users[0]).toMatchObject({ userid: 'u', avatarUrl: 'av' })
  })

  it('listSubDepts 数组映射', async () => {
    const stub = stubApi({ 'departments/1': [{ deptId: 2, name: '研发部', parentDeptId: 1 }] })
    const c = makeClient(stub)
    const r = await c.listSubDepts(1)
    expect(r).toEqual([{ deptId: 2, name: '研发部', parentDeptId: 1 }])
  })
})

describe('DingtalkClient — 错误与 token 重试', () => {
  it('errcode 归一化为 DingtalkError（含 url）', async () => {
    const stub = stubApi({ 'contact/users/u1': { errcode: 60011, errmsg: '无权限' } })
    const c = makeClient(stub)
    await expect(c.getUserDetail('u1')).rejects.toMatchObject({ errcode: 60011, name: 'DingtalkError' })
  })

  it('token 失效（40014）→ invalidate + 重试一次成功', async () => {
    const stub = stubApi({ 'contact/users/u1': { userid: 'u1', name: 'ok' } }, { failFirst: true })
    const c = makeClient(stub)
    const r = await c.getUserDetail('u1')
    expect(r).toMatchObject({ userid: 'u1' })
    // 至少两次 gettoken（首次 + invalidate 后重取）
    expect(stub.calls.filter((x) => x.url.includes('gettoken')).length).toBeGreaterThanOrEqual(2)
  })
})

describe('createDingtalkPlatform — 能力动态声明 + supports 协商', () => {
  it('无 oauthOrgId → 不声明 oauth 能力', () => {
    const p = createDingtalkPlatform({ appKey: 'k', appSecret: 's' })
    expect(p.name).toBe('dingtalk')
    expect(p.capabilities).toEqual(['message', 'approval', 'contacts'])
    expect(supports(p, 'message')).toBe(true)
    expect(supports(p, 'oauth')).toBe(false)
  })

  it('有 oauthOrgId → 声明 oauth + 预设有 endpoints', () => {
    const p = createDingtalkPlatform({ appKey: 'k', appSecret: 's', oauthOrgId: 'org1' })
    expect(p.capabilities).toContain('oauth')
    expect(supports(p, 'oauth')).toBe(true)
    const preset = p.oauth!()
    expect(preset.endpoints.authorizeUrl).toContain('/org1/authorize')
  })

  it('supports 守卫类型收窄后可安全调用能力方法', () => {
    const p = createDingtalkPlatform({ appKey: 'k', appSecret: 's' })
    if (supports(p, 'approval')) {
      // 类型层面：p 已收窄为含 ApprovalCap
      expect(typeof p.createApprovalInstance).toBe('function')
    } else {
      throw new Error('approval 能力应已声明')
    }
  })
})
