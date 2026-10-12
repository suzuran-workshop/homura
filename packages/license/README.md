# @homura/license

激活客户端：注册 → 心跳 → 远程停服守卫。对接中央授权服务 `../homura-genuine`（契约先行，见 `./contract` 与 `docs/specs/module-license`）。

```ts
import { LicenseClient } from '@homura/license'
import { licenseGuard } from '@homura/license/hono'
import { createDrizzleStateStore } from '@homura/license'

const license = new LicenseClient({
  server: 'https://genuine.example', // homura-genuine
  productId: 'my-product', appId: 'my-app',
  stateStore: createDrizzleStateStore(db), // instanceKey 持久化
})

await license.register()          // → { status, heartbeatIntervalSec, graceSec }
license.startHeartbeat({ onError: console.error })
license.getStatus()               // 'active' | 'grace' | 'suspended' | 'unknown'

// 停服守卫：suspended → 503（/healthz 与 /auth/* 默认豁免）；grace → 放行 + 警告头
app.use('*', licenseGuard(license)) // fail-open 默认；strict: true 则未注册即停
```

状态机：心跳失败走宽限期（server 下发 graceSec）继续服务（fail-open——守卫不该让 App 因授权服务器故障宕机）；server 明示 suspended 立即生效。使用示范见模板 `src/server/index.ts`。
