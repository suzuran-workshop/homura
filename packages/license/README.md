# @homurajs/license

激活客户端：注册 → 心跳 → 远程停服守卫。对接中央授权服务 `../homura-genuine`（契约先行，见 `./contract` 与 `docs/specs/module-license`）。

state store 有两版实现，按数据方言选：`createDrizzleStateStore(db)`（`sqlite` / `pg`）与 `createRestStateStore(rest)`（`rest`，qw-pages）。

```ts
import { LicenseClient, createDrizzleStateStore, createRestStateStore } from '@homurajs/license'
import { licenseGuard } from '@homurajs/license/hono'

const license = new LicenseClient({
  server: 'https://genuine.example', // homura-genuine
  productId: 'my-product',
  appId: 'my-app',
  stateStore: isRest ? createRestStateStore(rest) : createDrizzleStateStore(db),
})

await license.register() // → { status, heartbeatIntervalSec, graceSec }
license.startHeartbeat({ onError: console.error })
license.getStatus() // 'active' | 'grace' | 'suspended' | 'unknown'

// 停服守卫：suspended → 503；grace → 放行 + X-Homura-License-Warning 头
// 默认豁免「健康检查路径 + /auth/*」；fail-open 默认，strict: true 则未注册即停
app.use('*', licenseGuard(license))
```

**豁免清单必须与 app-kit 注册的健康检查路径同源**。`/healthz` 在 qw-pages 上被 Page Gateway 保留（网关自答 `ok`，请求不下发到 App），App 实际注册在 `/_healthz`；若守卫仍硬编码豁免 `/healthz`，停服时健康检查会一起被 503，正好毁掉 fail-open 的语义。两种对齐方式：

```ts
import { healthzPathFor, detectRuntime } from '@homurajs/core'

// ① 显式传路径（推荐：与 createApp 返回的 healthzPath 用同一个值）
licenseGuard(license, { healthzPath: built.healthzPath })
// ② 不传则按 env 自动探测形态
licenseGuard(license, { target: detectRuntime(process.env).target })
// ③ 完全自定义
licenseGuard(license, { bypass: (c) => c.req.path.startsWith('/auth/') })
```

**qw-pages 前置条件**：`license_state` 表与 anon RLS policy 必须在部署期用平台受控迁移建好（App 无 DDL 权限）。REST 版 store 与 drizzle 版的唯一本质差异就是**不建表**——drizzle 版构造时会 `CREATE TABLE IF NOT EXISTS`，REST 版没有这个能力，缺表时由 `RestError` 的 hint 指出。

> 现状：`../homura-genuine` 尚未建立，本包契约先行；REST state store 只有单测，未在部署态执行过。

状态机：心跳失败走宽限期（server 下发 `graceSec`）继续服务（fail-open——守卫不该让 App 因授权服务器故障宕机）；server 明示 suspended 立即生效。使用示范见模板 `src/server/app.ts`（buildLicense）与入口 `src/server/index.ts`（onStart 注册+心跳、onStop 停循环）。
