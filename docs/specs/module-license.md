# Spec — license 契约（@homurajs/license ↔ homura-genuine）

## 要构建什么

- 目标：App 与中央授权服务之间的激活 / 心跳 / **到期** / **功能范围**契约，且授权内容不可被篡改
- 契约文件 `packages/license/src/contract.ts` 与 `../homura-genuine/src/contract.ts` **逐字一致**；
  genuine 侧有 `src/contract-parity.test.ts` 守着（漂移时报出首个不同行号并给出"cp 覆盖、别手工合并"的修法）
- 现状：homura-genuine **已实现**（Hono + `node:sqlite` + Ed25519，运行时依赖只有 hono），双端已用真进程联调

## 契约（v2）

```
POST {server}/v1/register   { productId, appId, instanceKey, licenseKey?, version?, fingerprint? }
  → 200 { licenseId, status, heartbeatIntervalSec, graceSec, issuedAt, license: SignedEntitlement }
  → 403 instance_mismatch（该许可已绑定别的实例）/ self_register_disabled
  → 404 product_not_found

POST {server}/v1/heartbeat  { licenseId, instanceKey, metrics?: { activeUsers?, reqPerMin? } }
  → 200 { status, heartbeatIntervalSec, serverTime, notice?, license: SignedEntitlement }
  → 404 license_not_found / 403 instance_mismatch

GET  {server}/v1/keys       → { keys: [{ keyId, publicKey, retired }] }   // 公钥分发
GET  {server}/healthz       → { status: 'ok' }
```

错误码集中在 `GENUINE_ERROR_CODES`，消费侧可据此区分"授权问题"与"网络问题"
（后者要走 fail-open，前者不该）。

### 签名授权载荷 `LicenseEntitlement`

| 字段                                | 含义                                           | 为什么必须在签名覆盖范围内                                    |
| ----------------------------------- | ---------------------------------------------- | ------------------------------------------------------------- |
| `licenseId` / `productId` / `appId` | 标识                                           | 防跨产品/跨 App 挪用                                          |
| `instanceKey`                       | 绑定的实例                                     | **防把 A 实例的授权响应重放给 B 实例**                        |
| `status`                            | `active` \| `expired` \| `suspended`           | 防把 expired/suspended 改成 active                            |
| `expiresAt`                         | 到期（ISO，`null` = 永不过期），中心可随时调整 | **防把到期日改晚**                                            |
| `enforcement`                       | `none` \| `notice` \| `core` \| `all`          | 防篡改者自选最宽处置强度                                      |
| `features`                          | 授权的功能范围                                 | 防自己给自己加功能                                            |
| `notice`                            | 强提醒文案                                     | 防把提醒文案抹掉                                              |
| `issuedAt` / `serverTime`           | 签发时间 / 中心当前时间                        | `serverTime` 用于校正本地时钟偏差，**防回拨系统时间绕过到期** |
| `heartbeatIntervalSec` / `graceSec` | 心跳参数                                       | 防把宽限期改长                                                |

签名算法：Ed25519 over `canonicalize(entitlement)` 的 UTF-8 字节，输出 base64url。
`keyId = sha256(normalizePem(publicPem))` 前 16 位 hex。

⚠ `canonicalize`（确定性序列化：键升序、跳过 undefined、数组保序、无空白）与 `normalizePem`
（CRLF→LF + trim）**都是契约的一部分**，两侧必须一致：前者决定签名字节，后者决定 keyId。
它们放在 contract.ts 里而不是各自的工具文件，就是为了被 parity 测试一起守住。

⚠ 为什么必须非对称：对称密钥得随 App 产物分发，而产物会落到别人的部署环境——拿到产物即可
自签"永不过期 + 全功能"。故中心持私钥签发，App 只嵌公钥（`GENUINE_PUBLIC_KEY`）验证。

## 行为（LicenseClient）

**状态机优先级**（`getStatus()`，从高到低）：

1. 未注册 → `unknown`
2. 验签失败且策略为 `suspend` → `suspended`
3. 中心明示 `suspended` → `suspended`
4. **本地判定已到期** → `expired`（不等心跳；用 `serverTime` 偏差校正）
5. 失联超 `graceSec` → `grace`（fail-open，ADR-011）
6. 否则用中心下发的状态

`grace` 与 `unknown` 只存在于消费侧，中心从不下发。

**验签采信规则**（安全关键）：签名状态四态 `absent` / `unverified` / `invalid` / `verified`。

| 状态         | 含义                               | 处置                                                                                                                                              |
| ------------ | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `verified`   | 验签通过且 instanceKey 相符        | 采信载荷全部字段                                                                                                                                  |
| `invalid`    | 篡改 / 密钥不符 / 授权属于别的实例 | `suspended`（可用 `onInvalidSignature:'ignore'` 降级为仅记录，**调试专用**）；且 **enforcement 取最严 `all`、features 全拒、notice 换成安全告警** |
| `unverified` | 下发了授权但本地没配公钥           | 状态退回响应标量；features 仍全拒                                                                                                                 |
| `absent`     | 旧版中心不下发 `license` 字段      | 向后兼容，只用标量 status                                                                                                                         |

**核心不变量：验签不通过时，载荷里的任何字段都不得用于决策。** 否则篡改者可以把
`enforcement` 写成 `none`、把 `features` 塞满，等于绕过整个授权。（这条曾是真漏洞：
`requireFeature` 原先直接读 `getEntitlement().features`，见下方"联调抓到的缺陷"。）

**访问器**：`getStatus()` / `getEntitlement()`（原始载荷，可能不可信，仅供诊断展示）/
`getSignatureState()` / `hasFeature(f)`（只在 verified 时可能为真）/ `getEnforcement()` /
`getNotice()`（非 active 时保证非空）。

## 行为（licenseGuard + requireFeature）

**处置强度四档**（由中心按许可设置、可随时调整）：

| enforcement | 守卫行为                                                                                  |
| ----------- | ----------------------------------------------------------------------------------------- |
| `none`      | 只记录：不拦、不加提醒头（观察期用；`active` 时中心恒下发此值）                           |
| `notice`    | 功能全开，但**每个响应**带 `X-Homura-License-Status` 与 `X-Homura-License-Notice`         |
| `core`      | 命中 `corePaths`（缺省 `['/api']`，可由 `GENUINE_CORE_PATHS` 配）→ 503；其余放行 + 提醒头 |
| `all`       | 全站 503（豁免路径除外）+ 提醒头                                                          |

`core` 档刻意不拦页面与静态资源：用户得能打开界面，才看得到"为什么功能没了"。

**提醒头**：中文文案必须 `encodeURI` 后传输（HTTP 头只能安全承载 latin1），前端 `decodeURI` 还原。
`active` 状态下若中心显式写了 `notice`（到期前预警等运营通知）也照常展示，但不影响任何功能。

**豁免清单**（`createDefaultBypass`，与 app-kit 同源）：健康检查路径（`healthzPathFor(target)`，
qw-pages 是 `/_healthz`）、`/auth/*`（停服时仍须能走登录链）、`/_license`
（`enforcement=all` 时它必须仍可读，否则前端无法解释为什么全站 503）。

**fail-open（ADR-011，含启动期）**：`grace` / `unknown` 不拦（`strict:true` 时 unknown 才 503）；
**`register()` 失败也不能让 App 起不来**——否则授权中心在启动那一刻不可达就等于全站宕机。
模板的做法是 warn 后继续启动，状态停在 `unknown`，靠心跳循环重试。

**`requireFeature(client, name)`**：功能范围闸门，**默认拒绝**（拿不到可信授权 = 不放行），
判定只走 `client.hasFeature()`。与 licenseGuard 叠加：guard 管全局处置，它管逐点能力开关。

## 模板接线

| 配置                                                            | 说明                                                         |
| --------------------------------------------------------------- | ------------------------------------------------------------ |
| `GENUINE_SERVER`                                                | 中心地址（配置即启用 license 层）                            |
| `GENUINE_PRODUCT_ID` / `GENUINE_APP_ID` / `GENUINE_LICENSE_KEY` | 身份与预签发许可                                             |
| `GENUINE_PUBLIC_KEY`                                            | 中心 Ed25519 公钥 PEM。**配了才验签**，生产必配；未配会 warn |
| `GENUINE_CORE_PATHS`                                            | `core` 档的核心路径前缀，逗号分隔，缺省 `/api`               |

公钥是多行 PEM，写进 `config/homura.config.env` 时用双引号包裹并把换行写成 `\n`
（`applyEnvFile` 会还原）。state store 按方言选：SQL → `createDrizzleStateStore`，
REST（qw-pages）→ `createRestStateStore`。

模板暴露 `GET /_license`：`{ status, enforcement, notice, expiresAt, features, signature }`，
供前端渲染强提醒。

## 双端联调实测（2026-10-14）

真实 genuine 进程（`:8788`，sqlite + Ed25519）× 真实模板 App（`:3100`，standalone/sqlite，
公钥经配置文件投递，心跳 2s）。每次中心改动后等一个心跳周期再观察：

| #   | 中心动作             | App 侧观测                                                                              |
| --- | -------------------- | --------------------------------------------------------------------------------------- |
| 1   | —                    | `active`，`sig=verified`，`features=[basic,export]`，`/api/todos` 200，无授权头         |
| 2   | `expiresInDays:-1`   | `expired` + `core` → `/api/todos` **503 `license_expired`**；`/` **200 且带 notice 头** |
| 3   | `enforcement:notice` | `/api/todos` **200** + notice 头                                                        |
| 4   | `enforcement:all`    | `/api/todos` 与 `/` 全 **503**；`/_license` 仍 **200**                                  |
| 5   | `expiresInDays:30`   | 一个心跳内回到 `active`，503 消失                                                       |
| 6   | `features:["basic"]` | `export` 被收回                                                                         |
| 7   | `status:suspended`   | 503 `service_suspended`                                                                 |
| 8   | 恢复 + 自定义文案    | `active`（该轮发现 active 时显式文案被丢弃，已修）                                      |

全程 `sig=verified`，说明"中心签发 → 配置文件投递公钥 → App 验签"链路通。

## 联调抓到的缺陷（单测一个都没抓到，均已修）

1. **`keyId` 对 PEM 尾部空白敏感**：中心用 `export({format:'pem'})` 的产物算 keyId（带尾随换行），
   运营从日志复制进配置文件时换行没了 → 两侧 keyId 不同 → App 报"中心可能已轮换密钥"。
   一个纯空白差异伪装成密钥轮换事故，且现象把排查方向指向中心。→ 新增 `normalizePem`，
   `keyIdOf` 先规范化再哈希，并加三种空白变体的测试。
   ⚠ 派生方式变了，修复前建的库需重新生成密钥。
2. **`requireFeature` 采信未验签载荷**：读的是 `getEntitlement().features`，篡改者塞满即可放行。
   → 判定改走 `hasFeature()`（只在 verified 时为真），`getEnforcement()` 不可信时取最严 `all`，
   `getNotice()` 换安全告警。由 `entitlement.test.ts` 锁住。
3. **`register()` 失败 → `process.exit(1)`**：违背 ADR-011 的 fail-open，中心不可达即全站宕机。
   联调时真的触发了（残留的旧 genuine 进程导致 `instance_mismatch` 403，App 当场退出）。
   → 改为 warn 后继续启动 + 心跳重试。
4. **active 时丢弃中心显式文案**：运营无法做到期前预警。→ `noticeFor` 在 active 时透传显式文案
   （仍不自动生成、不影响功能）。

## 验收标准

- [x] 契约类型单文件，且两侧逐字一致（parity 测试守）
- [x] fake genuine 全流程测试 + 签名授权的特性测试（篡改四类字段各自失败、四态签名状态、
      本地到期与时钟回拨、四档处置、中文提醒头编解码、requireFeature 三态）
- [x] homura-genuine 实现并与消费侧真进程联调（八阶段生命周期）
- [ ] **qw-pages 形态未验证**：`createRestStateStore` 至今没在部署态执行过。障碍是 Page 里的 App
      必须能公网访问 genuine，而 Pages 出网只放行 443 → genuine 需以 https 公网可达
- [ ] **前端强提醒 UI 未实现**：目前只有响应头 + `/_license` 端点，"无差别提示所有用户"
      还差 React 端 banner
- [ ] **模板缺 `requireFeature` 使用示范**：中间件已导出并有单测，但模板是"活文档"，
      没有示范等于派生 App 的 Agent 不知道功能范围该怎么接
