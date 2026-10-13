# @homurajs/license

激活与授权：注册 → 心跳 → **验签采信** → 到期/停服处置 → 功能范围闸门。对接中央授权服务 `../homura-genuine`（已实现；契约见 `./contract`，两侧逐字同步，spec 见 `docs/specs/module-license`）。

授权载荷由中心用 **Ed25519 签名**，App 只嵌公钥验证——所以必须配 `GENUINE_PUBLIC_KEY` 才有安全性。

```ts
import { LicenseClient, createDrizzleStateStore, createRestStateStore } from '@homurajs/license'
import { licenseGuard, requireFeature, LICENSE_STATUS_PATH } from '@homurajs/license/hono'

const client = new LicenseClient({
  server: 'https://genuine.example',
  productId: 'my-product',
  appId: 'my-app',
  licenseKey: 'LIC-...', // 中心预签发时给的（不配则看产品是否允许自助注册）
  stateStore: isRest ? createRestStateStore(rest) : createDrizzleStateStore(db),
  publicKey: process.env.GENUINE_PUBLIC_KEY, // 中心 Ed25519 公钥 PEM；配了才验签
  // onInvalidSignature: 'suspend',              // 缺省即此值；'ignore' 仅调试用
})

await client.register() // ⚠ 失败不要让进程退出（见下方规则 3）
client.startHeartbeat({ onError: console.error })

client.getStatus() // 'active'|'expired'|'suspended'|'grace'|'unknown'
client.getEnforcement() // 'none'|'notice'|'core'|'all'（active 恒 none；授权不可信恒 all）
client.getNotice() // 强提醒文案（非 active 时保证非空）
client.hasFeature('export') // 只有验签通过才可能为 true
client.getSignatureState() // verified | invalid | unverified | absent

// 守卫：按中心下发的 enforcement 分档处置
app.use('*', licenseGuard(client, { healthzPath, corePaths: ['/api'] }))
// 逐点功能开关（默认拒绝）
app.get('/api/export', requireFeature(client, 'export'), handler)
// 授权状态端点（在豁免清单里，全站停服时仍可读，供前端渲染提醒）
app.get(LICENSE_STATUS_PATH, (c) =>
  c.json({ status: client.getStatus(), notice: client.getNotice() }),
)
```

## 处置强度四档（由中心按许可设置，可随时调整）

| enforcement | 行为                                                                          |
| ----------- | ----------------------------------------------------------------------------- |
| `none`      | 只记录：不拦、不加提醒头（`active` 时中心恒下发此值）                         |
| `notice`    | 功能全开，但每个响应带 `X-Homura-License-Status` 与 `X-Homura-License-Notice` |
| `core`      | 命中 `corePaths`（缺省 `['/api']`）→ 503；其余放行 + 提醒头                   |
| `all`       | 全站 503（豁免路径除外）+ 提醒头                                              |

`core` 档刻意不拦页面与静态资源：用户得能打开界面，才看得到"为什么功能没了"。提醒头里的中文文案是 `encodeURI` 后的（HTTP 头只能安全承载 latin1），前端 `decodeURI` 还原。`active` 状态下若中心显式写了 `notice`（到期前预警等），也照常展示但不影响功能。

## 三条必须知道的规则

**1. 验签不通过时，载荷里的任何字段都不得用于决策。** `enforcement` 取最严 `all`、`features` 全拒、`notice` 换成安全告警。否则篡改者可以把 `enforcement` 写成 `none`、把 `features` 塞满，等于绕过整个授权。（这曾是真漏洞：`requireFeature` 直接读了 `getEntitlement().features`。`getEntitlement()` 返回**原始**载荷，只适合诊断展示。）

**2. 到期在本地判定，不等心跳。** `getStatus()` 用中心下发的 `serverTime` 校正时钟偏差后再比 `expiresAt`，所以用户回拨系统时间也绕不过去。

**3. fail-open 要覆盖启动期（ADR-011）。** `register()` 抛错时**不要** `process.exit`——否则授权中心在 App 启动那一刻不可达（或返回 4xx）就等于全站宕机。正确做法是 warn 后继续启动，状态停在 `unknown`（守卫放行，`strict` 才 503），靠心跳循环重试。

## 状态机优先级（`getStatus()`）

未注册 `unknown` → 验签失败 `suspended` → 中心明示 `suspended` → **本地判定 `expired`** → 失联超宽限 `grace` → 中心下发状态。`grace` 与 `unknown` 只存在于消费侧，中心从不下发。

签名状态四态：`verified`（采信载荷）/ `invalid`（篡改或密钥不符 → suspended + 最严处置）/ `unverified`（没配公钥 → 状态退回响应标量，但 features 仍全拒）/ `absent`（旧版中心不下发 `license` 字段 → 向后兼容）。

## 豁免清单（`createDefaultBypass`）

健康检查路径（与 app-kit **同源**）+ `/auth/*`（停服时仍须能走登录链）+ `/_license`（`enforcement=all` 时前端要靠它解释为什么全站 503）。

健康检查路径必须与 app-kit 注册的一致：qw-pages 上 `/healthz` 被 Page Gateway 保留（网关自答 `ok`，请求不下发到 App），App 实际注册在 `/_healthz`。若守卫仍硬编码 `/healthz`，停服时健康检查会一起被 503，正好毁掉 fail-open 的语义。

```ts
licenseGuard(client, { healthzPath: built.healthzPath }) // ① 推荐：与 createApp 同源
licenseGuard(client, { target: detectRuntime(process.env).target }) // ② 按 env 自动探测
licenseGuard(client, { bypass: (c) => c.req.path.startsWith('/auth/') }) // ③ 完全自定义
```

## qw-pages 前置条件

- `license_state` 表与 anon RLS policy 必须在部署期用平台受控迁移建好（App 无 DDL 权限）。REST 版 store 与 drizzle 版的唯一本质差异就是**不建表**（drizzle 版构造时会 `CREATE TABLE IF NOT EXISTS`），缺表时由 `RestError` 的 hint 指出
- genuine 必须以 **https 公网可达**（Pages 出网只放行 443）
- ⚠ 该形态尚未在部署态验证过；standalone 已双端真进程联调八阶段通过（见 spec）

使用示范见模板 `src/server/app.ts`（buildLicense）与入口 `src/server/index.ts`（onStart 注册+心跳、onStop 停循环）。
