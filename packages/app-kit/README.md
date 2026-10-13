# @homurajs/app-kit

组装入口：`createApp` 渐进式装配（零注入也能跑）+ 双形态 RuntimeAdapter（qw-pages 全部未知约定的单点收口）。

```ts
import { createApp } from '@homurajs/app-kit'
import { Hono } from 'hono'

// 最小 App：零能力注入
const { app, runtime } = createApp({ routes: (deps) => myRoutes(deps) })

// 渐进解锁：注入即启用（实例由 App 构造，app-kit 不硬依赖能力包）
const composed = createApp({
  auth: { sessions, sessionMiddleware, authRoutes },   // 登录链
  license: { client: license, guard: licenseGuard },    // 激活守卫
  thirdParty: { platform },                             // deps.platform 暴露给路由
  healthz: { checks: [{ name: 'db', check: () => db.select().from(...).limit(1).then(() => true) }] },
  routes: myRoutes,
})
```

固定中间件链：`basePath → request-id/日志 → /healthz（豁免守卫）→ licenseGuard → sessionMiddleware → authRoutes → App routes → 静态资源(dist/client) → SPA fallback`

双形态启动：
```ts
import { createNodeAdapter } from '@homurajs/app-kit/serve'      // 独立：监听端口
import { createQwPagesAdapter, exportHandlers } from '@homurajs/app-kit/qw-pages' // qw-pages：三导出对冲
```

使用示范见模板 `src/server/index.ts` 与 `src/server/qw-pages.ts`。
