/**
 * /api 业务路由：todos CRUD + /api/me。
 * 活文档：示范 auth 的 sessionMiddleware 注入的 c.get('auth')（类型由 @homura/auth/hono
 * 的 ContextVariableMap 增强），以及 todos repository 的双方言无关访问。
 *
 * 归属模型：登录用户操作自己的 todos；匿名操作无主 todos（ownerSub IS NULL）。
 */
import { Hono } from 'hono'
import type { Context } from 'hono'
import type { TodoRepo } from '../todos-repo.js'
import type { TodoCreate } from '../../shared/types.js'

export function buildApiRoutes(repo: TodoRepo): Hono {
  const app = new Hono()

  // 当前用户身份（匿名返回 null，前端据此显示登录按钮）
  app.get('/me', (c) => {
    const auth = c.get('auth')
    if (!auth) return c.json({ user: null })
    return c.json({ user: { sub: auth.sub, nickname: auth.nickname, avatarUrl: auth.avatarUrl } })
  })

  const ownerOf = (c: Context): string | null => c.get('auth')?.sub ?? null

  app.get('/todos', async (c) => {
    const todos = await repo.list(ownerOf(c))
    return c.json({ todos })
  })

  app.post('/todos', async (c) => {
    const body = (await c.req.json().catch(() => null)) as TodoCreate | null
    if (!body?.title?.trim()) return c.json({ error: 'title_required' }, 400)
    const todo = await repo.create(body.title.trim(), ownerOf(c))
    return c.json({ todo }, 201)
  })

  app.patch('/todos/:id', async (c) => {
    const todo = await repo.toggle(c.req.param('id'), ownerOf(c))
    if (!todo) return c.json({ error: 'not_found' }, 404)
    return c.json({ todo })
  })

  app.delete('/todos/:id', async (c) => {
    const ok = await repo.remove(c.req.param('id'), ownerOf(c))
    if (!ok) return c.json({ error: 'not_found' }, 404)
    return c.json({ ok: true })
  })

  return app
}
