# Spec — @homurajs/3p 平台抽象与钉钉实现

## 要构建什么
- 目标：第三方平台（钉钉/企微/飞书…）能力分片抽象 + 钉钉首个实现

## 能力分片（src/index.ts，契约单一事实源）

| Capability | 接口 | 钉钉实现端点 |
|-----------|------|-------------|
| oauth | oauth(): OAuthPreset | ../oauth2-dingtalk 三端点（结构化契约喂 auth 包） |
| message | sendWorkMessage({agentId, userIds, msg}) | POST **oapi.dingtalk.com/topapi/message/corpconversation/asyncsend_v2**（旧版通用端点；v1.0 新端点需白名单，故用旧版保证可用，msg 结构两版兼容） |
| approval | listProcessCodes / createApprovalInstance / getApprovalInstance | POST /v1.0/workflow/processCentricV2/list · POST/GET /v1.0/workflow/processInstances |
| contacts | getUserDetail / listDeptUsers(游标) / listSubDepts | GET /v1.0/contact/users/{id} · POST /v1.0/contact/users/{deptId}/users · GET /v1.0/contact/departments/{deptId} |
| webhook | （本轮不做，占位） | 需公网入口 + AES + 去重；有凭据联调条件后独立评估 |

> 注：message 走旧版 oapi（topapi），approval/contacts 走新版 api.dingtalk.com/v1.0；
> 两者都用企业 access_token（CorpTokenManager 托管），新版加 x-acs-dingtalk-access-token 头。

## 行为
- supports(platform, cap) 类型守卫：capabilities 声明数组包含才可用；钉钉能力按配置动态声明（oauthOrgId 缺失 → 不声明 oauth）
- CorpTokenManager：GET oapi.dingtalk.com/gettoken（appkey/appsecret → access_token 7200s）；缓存 + 提前 300s 刷新 + 并发 single-flight + invalidate() 主动失效
- DingtalkClient：统一 x-acs-dingtalk-access-token 头；errcode 归一化 DingtalkError；token 失效（特定 errcode）自动 invalidate + 重试一次

## 约束
- 纯 fetch（fetchImpl 注入）；消息体联合类型 text|markdown|link|oa

## 验收标准
- [x] supports 守卫 + 能力动态声明（oauthOrgId 缺失不声明 oauth）
- [x] CorpTokenManager：TTL 内单请求、single-flight 并发合并、提前 300s 刷新、失效 invalidate、刷新失败旧 token 韧性兜底（桩断言 7 项）
- [x] 各 API payload 快照测试（asyncsend_v2 消息体 text/markdown/link/oa、审批表单、通讯录归一 avatar→avatarUrl）
- [x] token 失效（errcode 40014）自动 invalidate + 重试一次
- [x] dingtalkOAuth 预设：标准 OIDC mapUser（sub/name/picture），空 picture 归一 undefined
