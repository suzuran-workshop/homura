/**
 * DingtalkClient 单测 —— 2026-10-23 重写。
 *
 * 旧测试是假绿灯：stubApi 按 URL **子串**匹配，断言的全是不存在的 v1.0 端点
 * （contact/users/{deptId}/users 等），从不打真实钉钉，故端点全错也全绿。
 * 本文件改为：桩**解析完整 URL**，精确断言 host / path / method / query / header / body，
 * 并按真实实测的响应形状（topapi 的 {errcode,result} snake_case、v1.0 的 {code,message}）
 * 校验解析与归一。核心回归防护是「认证传输按 host 分流」——这正是旧实现全线失效的根因。
 */
import { describe, expect, it, vi } from 'vitest'
import { CorpTokenManager } from './corp-token.js'
import { DingtalkClient, DingtalkError } from './api.js'
import { createDingtalkPlatform } from './index.js'
import { supports } from '../index.js'

interface ParsedReq {
  /** 'topapi' = oapi.dingtalk.com；'v1' = api.dingtalk.com/v1.0 */
  api: 'topapi' | 'v1'
  host: string
  path: string
  method: string
  query: URLSearchParams
  headers: Record<string, string>
  body?: Record<string, unknown>
}

type Responder = (req: ParsedReq) => { status: number; json: unknown }

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

/**
 * 精确桩：解析每个请求的完整 URL，gettoken 自动应答，其余交给 responder。
 * calls 供断言认证方式与端点。
 */
function stubDingtalk(respond: Responder, opts?: { gettoken?: () => unknown }) {
  const calls: ParsedReq[] = []
  const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const u = new URL(String(url))
    const parsed: ParsedReq = {
      api: u.host === 'oapi.dingtalk.com' ? 'topapi' : 'v1',
      host: u.host,
      path: u.pathname,
      method: init?.method ?? 'GET',
      query: u.searchParams,
      headers: (init?.headers ?? {}) as Record<string, string>,
      body: init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : undefined,
    }
    calls.push(parsed)
    if (parsed.path === '/gettoken') {
      return json(200, opts?.gettoken ? opts.gettoken() : { access_token: 'corp-tok', expires_in: 7200 })
    }
    const r = respond(parsed)
    return json(r.status, r.json)
  })
  return { calls, fetchImpl: fetchImpl as unknown as typeof fetch }
}

function makeClient(stub: ReturnType<typeof stubDingtalk>, opts?: { timeoutMs?: number }) {
  const corp = new CorpTokenManager({ appKey: 'k', appSecret: 's', fetchImpl: stub.fetchImpl })
  return new DingtalkClient(corp, { fetchImpl: stub.fetchImpl, ...opts })
}

const byPath = (table: Record<string, { status?: number; json: unknown }>): Responder => (req) => {
  const hit = table[req.path]
  return hit ? { status: hit.status ?? 200, json: hit.json } : { status: 200, json: { errcode: 0 } }
}

// ── 认证传输分流（根因回归防护）─────────────────────────────
describe('认证传输按 host 分流', () => {
  it('topapi 请求：access_token 走 query 参数，header 不含 x-acs（实测 oapi 仅认 query）', async () => {
    const stub = stubDingtalk(byPath({ '/topapi/v2/user/get': { json: { errcode: 0, result: { userid: 'u1' } } } }))
    const c = makeClient(stub)
    await c.getUserDetail('u1')
    const call = stub.calls.find((x) => x.path === '/topapi/v2/user/get')!
    expect(call.api).toBe('topapi')
    expect(call.query.get('access_token')).toBe('corp-tok')
    expect(call.headers['x-acs-dingtalk-access-token']).toBeUndefined()
  })

  it('v1.0 请求：access_token 走 x-acs header，query 不含 access_token', async () => {
    const stub = stubDingtalk(byPath({ '/v1.0/microApp/apps': { json: { appList: [] } } }))
    const c = makeClient(stub)
    await c.listMicroApps()
    const call = stub.calls.find((x) => x.path === '/v1.0/microApp/apps')!
    expect(call.api).toBe('v1')
    expect(call.headers['x-acs-dingtalk-access-token']).toBe('corp-tok')
    expect(call.query.get('access_token')).toBeNull()
  })
})

// ── 工作通知 + 投递回执 ─────────────────────────────────────
describe('工作通知', () => {
  it('asyncsend_v2：端点/agent_id/userid_list/msg 拼装 + 返回 taskId', async () => {
    const stub = stubDingtalk(
      byPath({ '/topapi/message/corpconversation/asyncsend_v2': { json: { errcode: 0, task_id: 88888 } } }),
    )
    const c = makeClient(stub)
    const r = await c.sendWorkNotice({
      agentId: '4108390000',
      userIds: ['u1', 'u2'],
      msg: { type: 'markdown', content: { title: '值周扣分', text: '# 三(2)班 -1' } },
    })
    expect(r).toEqual({ taskId: '88888' })
    const call = stub.calls.find((x) => x.path.endsWith('asyncsend_v2'))!
    expect(call.body).toMatchObject({ agent_id: 4108390000, userid_list: 'u1,u2' })
    expect(call.body!.msg).toMatchObject({ msgtype: 'markdown', markdown: { title: '值周扣分', text: '# 三(2)班 -1' } })
  })

  it('text/link/oa 四种 msg 形状映射正确（link 用 messageUrl）', async () => {
    const stub = stubDingtalk(
      byPath({ '/topapi/message/corpconversation/asyncsend_v2': { json: { errcode: 0, task_id: 1 } } }),
    )
    const c = makeClient(stub)
    await c.sendWorkNotice({ agentId: '1', userIds: ['u'], msg: { type: 'text', content: { text: 'hi' } } })
    await c.sendWorkNotice({
      agentId: '1', userIds: ['u'],
      msg: { type: 'link', content: { title: 't', text: 'x', messageUrl: 'http://a', picUrl: 'http://p' } },
    })
    await c.sendWorkNotice({ agentId: '1', userIds: ['u'], msg: { type: 'oa', content: { head: { text: 'OA' } } } })
    const msgs = stub.calls.filter((x) => x.path.endsWith('asyncsend_v2')).map((x) => x.body!.msg as Record<string, unknown>)
    expect(msgs.map((m) => m.msgtype)).toEqual(['text', 'link', 'oa'])
    expect((msgs[1] as { link: Record<string, unknown> }).link).toMatchObject({ messageUrl: 'http://a', picUrl: 'http://p' })
  })

  it('空 userIds → 抛 DingtalkError（不发请求、不吞信息）', async () => {
    const stub = stubDingtalk(byPath({}))
    const c = makeClient(stub)
    await expect(
      c.sendWorkNotice({ agentId: '1', userIds: [], msg: { type: 'text', content: { text: 'x' } } }),
    ).rejects.toThrow(DingtalkError)
    expect(stub.calls.filter((x) => x.path.endsWith('asyncsend_v2'))).toHaveLength(0)
  })

  it('getSendResult：errcode:0 也可能未送达，invalid/failed 列表必须暴露', async () => {
    const stub = stubDingtalk(
      byPath({
        '/topapi/message/corpconversation/getsendresult': {
          json: {
            errcode: 0,
            send_result: {
              invalid_user_id_list: ['ghost'],
              failed_user_id_list: [],
              read_user_id_list: ['u1'],
              unread_user_id_list: ['u2'],
              forbidden_list: ['u3'],
              invalid_dept_id_list: [9],
            },
          },
        },
      }),
    )
    const c = makeClient(stub)
    const r = await c.getSendResult('4108390000', '3446588165784')
    expect(r.invalidUserIds).toEqual(['ghost'])
    expect(r.readUserIds).toEqual(['u1'])
    expect(r.unreadUserIds).toEqual(['u2'])
    expect(r.forbiddenUserIds).toEqual(['u3'])
    expect(r.invalidDeptIds).toEqual([9])
  })

  it('getSendProgress：percent/status 归一', async () => {
    const stub = stubDingtalk(
      byPath({ '/topapi/message/corpconversation/getsendprogress': { json: { errcode: 0, progress: { progress_in_percent: 100, status: 2 } } } }),
    )
    const c = makeClient(stub)
    expect(await c.getSendProgress('1', '2')).toEqual({ percent: 100, status: 2 })
  })
})

// ── 通讯录（topapi v2，实测可用端点）─────────────────────────
describe('通讯录 topapi v2', () => {
  it('getUserDetail：走 topapi/v2/user/get，snake_case→camelCase 归一', async () => {
    const stub = stubDingtalk(
      byPath({
        '/topapi/v2/user/get': {
          json: { errcode: 0, result: { userid: 'u1', name: '张三', avatar: 'http://a', unionid: 'un', dept_id_list: [1, 2], mobile: '138', title: '老师' } },
        },
      }),
    )
    const c = makeClient(stub)
    const r = await c.getUserDetail('u1')
    expect(r).toMatchObject({ userid: 'u1', name: '张三', avatarUrl: 'http://a', unionid: 'un', deptIdList: [1, 2], mobile: '138', title: '老师' })
    expect(stub.calls.find((x) => x.path === '/topapi/v2/user/get')!.body).toMatchObject({ userid: 'u1' })
  })

  it('getUserDetail：result 缺失 → 60121（找不到用户）', async () => {
    const stub = stubDingtalk(byPath({ '/topapi/v2/user/get': { json: { errcode: 0 } } }))
    const c = makeClient(stub)
    await expect(c.getUserDetail('ghost')).rejects.toMatchObject({ errcode: 60121 })
  })

  it('listDeptUsers：走 topapi/v2/user/list，游标 + hasMore + nextCursor', async () => {
    const stub = stubDingtalk(
      byPath({
        '/topapi/v2/user/list': {
          json: { errcode: 0, result: { has_more: true, next_cursor: 20, list: [{ userid: 'u', name: 'n', avatar: 'av' }] } },
        },
      }),
    )
    const c = makeClient(stub)
    const r = await c.listDeptUsers(7, { cursor: 0, size: 20 })
    expect(r.hasMore).toBe(true)
    expect(r.nextCursor).toBe(20)
    expect(r.users[0]).toMatchObject({ userid: 'u', avatarUrl: 'av' })
    expect(stub.calls.find((x) => x.path === '/topapi/v2/user/list')!.body).toMatchObject({ dept_id: 7, cursor: 0, size: 20 })
  })

  it('listSubDepts：走 topapi/v2/department/listsub，dept_id→deptId 归一', async () => {
    const stub = stubDingtalk(
      byPath({ '/topapi/v2/department/listsub': { json: { errcode: 0, result: [{ dept_id: 2, name: '研发部', parent_id: 1 }] } } }),
    )
    const c = makeClient(stub)
    expect(await c.listSubDepts(1)).toEqual([{ deptId: 2, name: '研发部', parentDeptId: 1 }])
  })

  it('getDeptDetail：走 topapi/v2/department/get，含 memberCount', async () => {
    const stub = stubDingtalk(
      byPath({ '/topapi/v2/department/get': { json: { errcode: 0, result: { dept_id: 5, name: '技术部', parent_id: 1, member_count: 3 } } } }),
    )
    const c = makeClient(stub)
    expect(await c.getDeptDetail(5)).toEqual({ deptId: 5, name: '技术部', parentDeptId: 1, memberCount: 3 })
  })

  it('getUserByMobile：走 topapi/v2/user/getbymobile，取 result.userid', async () => {
    const stub = stubDingtalk(
      byPath({ '/topapi/v2/user/getbymobile': { json: { errcode: 0, result: { userid: 'u9' } } } }),
    )
    const c = makeClient(stub)
    expect(await c.getUserByMobile('13800000000')).toBe('u9')
  })

  it('listAdmins：走 topapi/user/listadmin，sys_level→sysLevel', async () => {
    const stub = stubDingtalk(
      byPath({ '/topapi/user/listadmin': { json: { errcode: 0, result: [{ userid: 'a1', sys_level: 1 }, { userid: 'a2', sys_level: 2 }] } } }),
    )
    const c = makeClient(stub)
    expect(await c.listAdmins()).toEqual([{ userid: 'a1', sysLevel: 1 }, { userid: 'a2', sysLevel: 2 }])
  })
})

// ── 全量通讯录（高层编排）─────────────────────────────────────
describe('fetchAllContacts 一口气拉全', () => {
  /** 部门树：1(根) → 2,3；用户 u1@2, u2@2, u2@3, u3@3（u2 跨部门重复，测去重） */
  const tree: Responder = (req) => {
    const deptId = req.body?.['dept_id'] as number | undefined
    if (req.path === '/topapi/v2/department/get') {
      return { status: 200, json: { errcode: 0, result: { dept_id: deptId, name: `D${deptId}`, member_count: 2 } } }
    }
    if (req.path === '/topapi/v2/department/listsub') {
      const result = deptId === 1 ? [{ dept_id: 2, name: 'A', parent_id: 1 }, { dept_id: 3, name: 'B', parent_id: 1 }] : []
      return { status: 200, json: { errcode: 0, result } }
    }
    if (req.path === '/topapi/v2/user/list') {
      const list =
        deptId === 2
          ? [{ userid: 'u1', name: '甲' }, { userid: 'u2', name: '乙' }]
          : deptId === 3
            ? [{ userid: 'u2', name: '乙' }, { userid: 'u3', name: '丙' }]
            : []
      return { status: 200, json: { errcode: 0, result: { has_more: false, list } } }
    }
    return { status: 200, json: { errcode: 0 } }
  }

  it('递归部门树 + 按 userid 去重 + 报告部门数', async () => {
    const stub = stubDingtalk(tree)
    const c = makeClient(stub)
    const snap = await c.fetchAllContacts({ concurrency: 1 })
    expect(snap.users.map((u) => u.userid).sort()).toEqual(['u1', 'u2', 'u3']) // u2 去重
    expect(snap.depts.map((d) => d.deptId).sort((a, b) => a - b)).toEqual([1, 2, 3])
    expect(snap.truncated).toBe(false)
    expect(snap.errors).toEqual([])
  })

  it('个别部门失败不中断整体，记入 errors 且 truncated=true', async () => {
    const flaky: Responder = (req) => {
      if (req.path === '/topapi/v2/user/list' && req.body?.['dept_id'] === 3) {
        return { status: 200, json: { errcode: 60011, errmsg: '无权限' } }
      }
      return tree(req)
    }
    const stub = stubDingtalk(flaky)
    const c = makeClient(stub)
    const snap = await c.fetchAllContacts({ concurrency: 1 })
    expect(snap.truncated).toBe(true)
    expect(snap.errors.some((e) => e.deptId === 3)).toBe(true)
    expect(snap.users.map((u) => u.userid)).toContain('u1') // 部门2 照常拉到
  })

  it('游标翻页：hasMore + nextCursor 直到取尽', async () => {
    let page = 0
    const paged: Responder = (req) => {
      if (req.path === '/topapi/v2/user/list' && req.body?.['dept_id'] === 1) {
        page++
        return page === 1
          ? { status: 200, json: { errcode: 0, result: { has_more: true, next_cursor: 10, list: [{ userid: 'p1' }] } } }
          : { status: 200, json: { errcode: 0, result: { has_more: false, list: [{ userid: 'p2' }] } } }
      }
      if (req.path === '/topapi/v2/department/listsub') return { status: 200, json: { errcode: 0, result: [] } }
      if (req.path === '/topapi/v2/department/get') return { status: 200, json: { errcode: 0, result: { dept_id: 1, name: 'R' } } }
      return { status: 200, json: { errcode: 0 } }
    }
    const c = makeClient(stubDingtalk(paged))
    const snap = await c.fetchAllContacts({ concurrency: 1 })
    expect(snap.users.map((u) => u.userid).sort()).toEqual(['p1', 'p2'])
  })

  it('家校通讯录：无 edu 权限（403）→ 降级 available=false，企业部分照常', async () => {
    const withEdu403: Responder = (req) => {
      if (req.path === '/v1.0/edu/teachers') {
        return { status: 403, json: { code: 'Forbidden.AccessDenied.AccessTokenPermissionDenied', message: '应用尚未开通所需的权限：[qyapi_addresslist_edu_read]' } }
      }
      return tree(req)
    }
    const c = makeClient(stubDingtalk(withEdu403))
    const snap = await c.fetchAllContacts({ includeFamily: true, concurrency: 1 })
    expect(snap.users.length).toBeGreaterThan(0) // 企业通讯录不受影响
    expect(snap.family?.available).toBe(false)
    expect(snap.family?.reason).toMatch(/edu_read/)
  })

  it('家校通讯录：有权限时 best-effort 解析教师列表（成功形状未实测，标注见 api.ts）', async () => {
    const withEdu: Responder = (req) => {
      if (req.path === '/v1.0/edu/teachers') {
        return { status: 200, json: { list: [{ userid: 't1', name: '王老师' }] } }
      }
      return tree(req)
    }
    const c = makeClient(stubDingtalk(withEdu))
    const snap = await c.fetchAllContacts({ includeFamily: true, concurrency: 1 })
    expect(snap.family?.available).toBe(true)
    expect(snap.family?.users).toEqual([{ userid: 't1', name: '王老师', mobile: undefined }])
  })

  it('不含 includeFamily 时不触碰 edu 端点', async () => {
    const stub = stubDingtalk(tree)
    const c = makeClient(stub)
    const snap = await c.fetchAllContacts({ concurrency: 1 })
    expect(snap.family).toBeUndefined()
    expect(stub.calls.some((x) => x.path.startsWith('/v1.0/edu'))).toBe(false)
  })
})

// ── 应用发现 ────────────────────────────────────────────────
describe('listMicroApps（agentId 发现）', () => {
  it('走 v1.0/microApp/apps，appList→MicroApp', async () => {
    const stub = stubDingtalk(
      byPath({ '/v1.0/microApp/apps': { json: { appList: [{ agentId: 4108390000, name: '测试', homepageLink: 'https://x' }] } } }),
    )
    const c = makeClient(stub)
    const apps = await c.listMicroApps()
    expect(apps).toEqual([{ agentId: 4108390000, name: '测试', homepageLink: 'https://x', pcHomepageLink: undefined, icon: undefined, desc: undefined }])
  })
})

// ── 审批（v1.0，best-effort + 权限错误不重试）────────────────
describe('审批 v1.0', () => {
  it('listProcessCodes：走正确端点 processCentres/schemaNames/processCodes', async () => {
    const stub = stubDingtalk(
      byPath({ '/v1.0/workflow/processCentres/schemaNames/processCodes': { json: { result: { list: [{ processCode: 'PROC-1', name: '请假' }] } } } }),
    )
    const c = makeClient(stub)
    const r = await c.listProcessCodes({ name: '请假' })
    expect(r).toEqual([{ processCode: 'PROC-1', name: '请假', description: undefined }])
    const call = stub.calls.find((x) => x.path.endsWith('processCodes'))!
    expect(call.method).toBe('GET')
    expect(call.query.get('name')).toBe('请假')
  })

  it('createApprovalInstance：POST v1.0/workflow/processInstances', async () => {
    const stub = stubDingtalk(byPath({ '/v1.0/workflow/processInstances': { json: { instanceId: 'inst-9' } } }))
    const c = makeClient(stub)
    const r = await c.createApprovalInstance({ processCode: 'P', originatorUserId: 'u0', formComponents: [{ name: '天数', value: '2' }] })
    expect(r).toEqual({ instanceId: 'inst-9' })
  })

  it('v1.0 权限 403：errcode=HTTP status、含字符串 code，且**不**触发 token 重试', async () => {
    let hits = 0
    const stub = stubDingtalk((req) => {
      // getApprovalInstance 现在走 query 参数 ?processInstanceId=（非路径参数）
      if (req.path === '/v1.0/workflow/processInstances' && req.query.get('processInstanceId') === 'probe') {
        hits++
        return { status: 403, json: { code: 'Forbidden.AccessDenied.AccessTokenPermissionDenied', message: '需要 Workflow.Instance.Read 权限' } }
      }
      return { status: 200, json: {} }
    })
    const c = makeClient(stub)
    await expect(c.getApprovalInstance('probe')).rejects.toMatchObject({ errcode: 403, code: 'Forbidden.AccessDenied.AccessTokenPermissionDenied' })
    expect(hits).toBe(1) // 403 权限错误不应被误判为 token 失效而重试
    expect(stub.calls.filter((x) => x.path === '/gettoken')).toHaveLength(1)
  })
})

// ── 错误约定与 token 重试 ────────────────────────────────────
describe('错误约定与 token 重试', () => {
  it('topapi errcode≠0（HTTP 200）→ 归一为 DingtalkError（含 errmsg）', async () => {
    const stub = stubDingtalk(byPath({ '/topapi/v2/user/get': { json: { errcode: 60011, errmsg: '无权限' } } }))
    const c = makeClient(stub)
    await expect(c.getUserDetail('u1')).rejects.toMatchObject({ errcode: 60011, name: 'DingtalkError' })
  })

  it('token 失效（40014）→ invalidate + 重试一次成功', async () => {
    let first = true
    const stub = stubDingtalk((req) => {
      if (req.path === '/topapi/v2/user/get') {
        if (first) {
          first = false
          return { status: 200, json: { errcode: 40014, errmsg: 'invalid access_token' } }
        }
        return { status: 200, json: { errcode: 0, result: { userid: 'u1', name: 'ok' } } }
      }
      return { status: 200, json: {} }
    })
    const c = makeClient(stub)
    const r = await c.getUserDetail('u1')
    expect(r).toMatchObject({ userid: 'u1' })
    expect(stub.calls.filter((x) => x.path === '/gettoken').length).toBeGreaterThanOrEqual(2)
    expect(stub.calls.filter((x) => x.path === '/topapi/v2/user/get')).toHaveLength(2)
  })

  it('网络错误/超时 → 归一为 DingtalkError(-1)，不误触发 token 重试', async () => {
    const fetchImpl = vi.fn(async (url: string | URL | Request) => {
      if (String(url).includes('gettoken')) return json(200, { access_token: 'tok', expires_in: 7200 })
      throw new Error('network down')
    }) as unknown as typeof fetch
    const corp = new CorpTokenManager({ appKey: 'k', appSecret: 's', fetchImpl })
    const c = new DingtalkClient(corp, { fetchImpl })
    await expect(c.getUserDetail('u1')).rejects.toMatchObject({ errcode: -1, name: 'DingtalkError' })
  })
})

// ── 平台能力声明 + supports 协商 ─────────────────────────────
describe('createDingtalkPlatform — 能力声明 + supports', () => {
  it('无 oauthOrgId → message/approval/contacts/apps（不含 oauth）', () => {
    const p = createDingtalkPlatform({ appKey: 'k', appSecret: 's' })
    expect(p.name).toBe('dingtalk')
    expect(p.capabilities).toEqual(['message', 'approval', 'contacts', 'apps'])
    expect(supports(p, 'message')).toBe(true)
    expect(supports(p, 'contacts')).toBe(true)
    expect(supports(p, 'apps')).toBe(true)
    expect(supports(p, 'oauth')).toBe(false)
  })

  it('有 oauthOrgId → 追加 oauth 能力，预设有 endpoints', () => {
    const p = createDingtalkPlatform({ appKey: 'k', appSecret: 's', oauthOrgId: 'org1' })
    expect(p.capabilities).toContain('oauth')
    expect(supports(p, 'oauth')).toBe(true)
    expect(p.oauth!().endpoints.authorizeUrl).toContain('/org1/authorize')
  })

  it('config.agentId 兜底：sendWorkMessage 未传 agentId 时用之', async () => {
    const stub = stubDingtalk(
      byPath({ '/topapi/message/corpconversation/asyncsend_v2': { json: { errcode: 0, task_id: 1 } } }),
    )
    const p = createDingtalkPlatform({ appKey: 'k', appSecret: 's', agentId: '4108390000', fetchImpl: stub.fetchImpl })
    await p.sendWorkMessage!({ agentId: '', userIds: ['u'], msg: { type: 'text', content: { text: 'x' } } })
    const call = stub.calls.find((x) => x.path.endsWith('asyncsend_v2'))!
    expect(call.body!.agent_id).toBe(4108390000)
  })

  it('supports 收窄后可安全调用能力方法', () => {
    const p = createDingtalkPlatform({ appKey: 'k', appSecret: 's' })
    if (supports(p, 'contacts')) {
      expect(typeof p.fetchAllContacts).toBe('function')
      expect(typeof p.getUserByMobile).toBe('function')
    } else {
      throw new Error('contacts 能力应已声明')
    }
  })
})
