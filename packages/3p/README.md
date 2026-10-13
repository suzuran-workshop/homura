# @homurajs/3p

第三方平台能力分片抽象：capability 声明 + `supports()` 守卫运行时协商。平台只实现部分能力，App 零 if-else 协商。

```ts
import { supports } from '@homurajs/3p'
import { createDingtalkPlatform } from '@homurajs/3p/dingtalk'

const platform = createDingtalkPlatform({
  appKey: '...', appSecret: '...', agentId: '...',
  oauthOrgId: 'my_org', // 不配则不声明 oauth 能力（动态声明）
})

platform.capabilities // ['message','approval','contacts','oauth']

// 能力协商：类型守卫收窄后安全调用
if (supports(platform, 'message')) {
  await platform.sendWorkNotice({
    agentId: '1000', userIds: ['user1'],
    msg: { type: 'markdown', content: { title: '值班提醒', text: '# 今晚值班：张三' } },
  })
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

企业 access_token 由 CorpTokenManager 托管（7200s 缓存+提前刷新+single-flight）。未来企微/飞书为新子路径实现，App 代码零改动。详见 `docs/specs/module-3p`；使用示范见模板 `src/server/routes/platform.ts`。
