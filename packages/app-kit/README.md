# @homurajs/app-kit

组装入口：`createApp` 渐进式装配（零注入也能跑）+ 双形态 RuntimeAdapter（跨形态差异的单点收口）。

```ts
import { createApp } from '@homurajs/app-kit'
import { Hono } from 'hono'

// 最小 App：零能力注入
const { app, runtime, healthzPath } = createApp({ routes: (deps) => myRoutes(deps) })

// 渐进解锁：注入即启用（实例由 App 构造，app-kit 不硬依赖能力包）
const composed = createApp({
  auth: { sessions, sessionMiddleware, authRoutes }, // 登录链
  license: { client: license, guard: licenseGuard }, // 激活守卫
  thirdParty: { platform }, // deps.platform 暴露给路由
  healthz: { checks: [{ name: 'db', check: () => pingDb() }] },
  routes: myRoutes,
})
```

固定中间件链：`basePath → request-id/日志 → healthz（豁免守卫，路径按形态取）→ licenseGuard → sessionMiddleware → authRoutes → App routes → 静态资源 → SPA fallback`

**健康检查路径按形态取**（`healthz.path` 可覆盖，缺省来自 `@homurajs/core` 的 `healthzPathFor`）：
standalone 用 `/healthz`；qw-pages 用 `/_healthz`——因为 `/healthz` 被平台 Page Gateway 保留，
网关自答 `ok` 且请求**不下发到 App 进程**（2026-10-13 实测）。若你自定义了路径，
`@homurajs/license` 的守卫豁免清单要传同一个值：`licenseGuard(client, { healthzPath })`。

双形态启动（**两者都监听端口**，差异只在缺省值）：

```ts
import { createNodeAdapter } from '@homurajs/app-kit/serve' // 独立：PORT ?? 3000，assetsDir=dist/client
import { createQwPagesAdapter } from '@homurajs/app-kit/qw-pages' // qw-pages：PORT ?? 8081 + HOST，assetsDir=client
```

> qw-pages 动态页 = 平台拉起 `node <entrypoint>` 的常驻进程，注入 `PORT`/`HOST` 并把网关流量反代到该 socket。
> **不存在** `default`/`fetch`/`app` 之类的 serverless 导出约定（实测：导出函数命中 0 次），
> 旧版的 `exportHandlers` 三重对冲已删除。详见仓库 `docs/specs/module-qw-pages.md`。

`trustProxy()` 的用途：qw-pages 恒为 true（网关后、公网 https），standalone 由 `TRUST_PROXY=1` 开启。
把它接到 `@homurajs/auth` 的 cookie `secure` 选项上，否则 https 站点会发非 Secure cookie。

使用示范见模板 `src/server/index.ts` 与 `src/server/qw-pages.ts`。
