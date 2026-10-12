/**
 * /api/platform 路由：3p 能力协商活文档。
 * 示范 supports(platform, cap) 类型守卫——平台只实现部分能力，
 * App 代码用守卫收窄后安全调用，未声明的能力端点直接不挂载。
 */
import { Hono } from 'hono'
import { supports, type ThirdPartyPlatform } from '@homura/3p'

export function buildPlatformRoutes(platform: ThirdPartyPlatform): Hono {
  const app = new Hono()

  // 能力清单（前端据此显示可用功能）
  app.get('/capabilities', (c) =>
    c.json({ name: platform.name, capabilities: platform.capabilities }),
  )

  // message 能力：推送工作通知（supports 守卫收窄后才挂）
  if (supports(platform, 'message')) {
    app.post('/notify', async (c) => {
      const body = (await c.req.json().catch(() => null)) as {
        userIds?: string[]
        title?: string
        text?: string
        agentId?: string
      } | null
      if (!body?.userIds?.length || !body.text) {
        return c.json({ error: 'userIds_and_text_required' }, 400)
      }
      const result = await platform.sendWorkMessage({
        agentId: body.agentId ?? '',
        userIds: body.userIds,
        msg: { type: 'markdown', content: { title: body.title ?? '通知', text: body.text } },
      })
      return c.json({ taskId: result.taskId })
    })
  }

  // approval 能力：列审批模板 + 发起审批
  if (supports(platform, 'approval')) {
    app.get('/approvals', async (c) => {
      const list = await platform.listProcessCodes()
      return c.json({ processes: list })
    })

    app.post('/approvals', async (c) => {
      const body = (await c.req.json().catch(() => null)) as {
        processCode?: string
        originatorUserId?: string
        formComponents?: Array<{ name: string; value: string }>
      } | null
      if (!body?.processCode || !body.originatorUserId) {
        return c.json({ error: 'processCode_and_originator_required' }, 400)
      }
      const r = await platform.createApprovalInstance({
        processCode: body.processCode,
        originatorUserId: body.originatorUserId,
        formComponents: body.formComponents ?? [],
      })
      return c.json({ instanceId: r.instanceId }, 201)
    })
  }

  // contacts 能力：查用户
  if (supports(platform, 'contacts')) {
    app.get('/users/:userid', async (c) => {
      const user = await platform.getUserDetail(c.req.param('userid'))
      return c.json({ user })
    })
  }

  return app
}
