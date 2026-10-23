# @homurajs/3p

第三方平台能力分片抽象：capability 声明 + `supports()` 守卫运行时协商。平台只实现部分能力，App 零 if-else 协商。

```ts
import { supports } from '@homurajs/3p'
import { createDingtalkPlatform } from '@homurajs/3p/dingtalk'

const platform = createDingtalkPlatform({
  appKey: '...', appSecret: '...', agentId: '...',
  oauthOrgId: 'my_org', // 不配则不声明 oauth 能力（动态声明）
})

platform.capabilities // ['message','approval','contacts','apps','oauth']

// 能力协商：类型守卫收窄后安全调用
if (supports(platform, 'message')) {
  const { taskId } = await platform.sendWorkMessage({
    agentId: '1000', userIds: ['user1'],
    msg: { type: 'markdown', content: { title: '值班提醒', text: '# 今晚值班：张三' } },
  })
  // ⚠ asyncsend_v2 是异步任务：errcode:0 只代表「已受理」，不代表「已送达」。
  // 发给不存在的 userid 也返 0，必须查回执才知道失败，否则推送失败会被静默记成成功。
  const result = await platform.getSendResult('1000', taskId)
  if (result.invalidUserIds.length) console.warn('无效收件人：', result.invalidUserIds)
}
if (supports(platform, 'approval')) {
  const { instanceId } = await platform.createApprovalInstance({
    processCode: 'PROC-XXX', originatorUserId: 'user1',
    formComponents: [{ name: '请假天数', value: '2' }],
  })
}

// OAuth 预设喂给 @homurajs/auth（鸭子类型，零 import 依赖）
const preset = supports(platform, 'oauth') ? platform.oauth() : null
```

## 一口气拉完整个通讯录

`fetchAllContacts` 递归部门树 + 游标翻页 + 按 userid 去重，可选携带家校通讯录：

```ts
if (supports(platform, 'contacts')) {
  const snap = await platform.fetchAllContacts({
    rootDeptId: 1,          // 缺省企业根
    includeFamily: true,    // 家校通讯录（需 qyapi_addresslist_edu_read 权限，无则降级）
    concurrency: 4,
    onProgress: ({ depts, users }) => console.log(`${depts} 部门 / ${users} 人`),
  })
  snap.depts   // PlatformDept[]，已跳过家校等负数保留子树
  snap.users   // PlatformUserDetail[]，已按 userid 去重（同一人可属多部门）
  snap.truncated // 个别部门失败即 true，详见 snap.errors
  snap.family    // includeFamily 时出现；无权限则 { available: false, reason }（不抛错）
}

// 单点查询与 agentId 发现
const userid = await platform.getUserByMobile('13800000000') // 手机号全局唯一，比姓名可靠
const apps   = supports(platform, 'apps') ? await platform.listMicroApps() : []
//   asyncsend_v2 必需 agentId，而它无法从 appKey 反推 → 列出企业应用供选择
```

## 认证与错误约定（两套 API 完全不同，实现已按 host 分流）

| Host | 认证 | 判错 |
|---|---|---|
| `oapi.dingtalk.com/topapi/*` | `?access_token=` 查询参数 | HTTP 200 也可能错，判 `errcode !== 0` |
| `api.dingtalk.com/v1.0/*` | `x-acs-dingtalk-access-token` 头 | HTTP 4xx 即错，body 是 `{code, message}` |

企业 access_token 由 CorpTokenManager 托管（7200s 缓存 + 提前 300s 刷新 + single-flight + 主动失效）。
token 失效只对精确信号集合 `{40014,40015,88,401}` 重试一次——403 权限错误不会被误判重试。
外呼经 `AbortSignal.timeout` 施加超时（`timeoutMs`，缺省 15s）。

未来企微/飞书为新子路径实现，App 代码零改动。端点与实测依据详见 `docs/specs/module-3p`；
使用示范见模板 `src/server/routes/platform.ts`。

## 测试

- 桩测试 `api.test.ts`（CI 常跑）：按完整 URL 精确断言认证方式/端点/请求体，非子串匹配。
- Live 集成测试 `api.live.test.ts`：凭证走 env（`DINGTALK_LIVE_APP_KEY` 等），缺省 skip。
  桩只能证明「代码符合我以为的契约」，端点是否真实存在只有 live 能证明——
  2026-10-23 正是 live 测出旧实现三个 contacts 端点全部 NotFound。
