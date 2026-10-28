# Spec — @homurajs/3p 平台抽象与钉钉实现

## 要构建什么
- 目标：第三方平台（钉钉/企微/飞书…）能力分片抽象 + 钉钉首个实现

## 能力分片（src/index.ts，契约单一事实源）

> ⚠ 2026-10-23 据**真实钉钉 API 实测**全面修订端点表。旧表的 contacts 三端点与 approval
> 的 listProcessCodes 端点**全部不存在**（InvalidAction.NotFound），message 因认证传输方式
> 错误发不出（见「认证传输」节）。旧「验收标准 [x]」是桩测试给的假绿灯——桩从不打真实钉钉，
> 端点全错也全绿。修订后每个端点都经 live 集成测试（api.live.test.ts）验证。

| Capability | 接口 | 钉钉实现端点（实测） |
|-----------|------|-------------|
| oauth | oauth(): OidcPreset | ../oidc-dingtalk issuer+三端点（结构化契约喂 auth 包） |
| message | sendWorkMessage / **getSendResult** / **getSendProgress** | POST **oapi/topapi/message/corpconversation/asyncsend_v2**（旧版通用端点；v1.0 需白名单）· POST oapi/topapi/message/corpconversation/**getsendresult** · **getsendprogress** |
| approval | listProcessCodes / createApprovalInstance / getApprovalInstance | GET /v1.0/workflow/processCentres/schemaNames/processCodes · POST /v1.0/workflow/processInstances · GET /v1.0/workflow/processInstances?**processInstanceId=**（query 参数，非路径参数） |
| contacts | getUserDetail / listDeptUsers / listSubDepts / **getDeptDetail** / **getUserByMobile** / **listAdmins** / **fetchAllContacts** | POST oapi/topapi/v2/user/get · oapi/topapi/v2/user/list（游标）· oapi/topapi/v2/department/listsub · oapi/topapi/v2/department/get · oapi/topapi/v2/user/getbymobile · oapi/topapi/user/listadmin |
| **apps**（新增） | listMicroApps | GET /v1.0/microApp/apps（agentId 发现：asyncsend_v2 必需 agentId，且无法从 appKey 反推） |
| webhook | （本轮不做，占位） | 需公网入口 + AES + 去重；有凭据联调条件后独立评估 |

### 认证传输（根因，两套 API 完全不同）

| Host | 认证方式 | 成功/失败判据 | 错误 body |
|---|---|---|---|
| `oapi.dingtalk.com/topapi/*`（旧版） | **`?access_token=` 查询参数** | HTTP 200 也可能错，判 `errcode !== 0` | `{errcode, errmsg}`，数据多在 `result` |
| `api.dingtalk.com/v1.0/*`（新版） | **`x-acs-dingtalk-access-token` 头** | HTTP 4xx 即错 | `{code:'InvalidAction.NotFound', message}`（字符串 code，无 errcode） |

- 实测：topapi 仅传头 → `errcode:88 access_token is blank`；v1.0 传 query 无效。
- **token 失效重试**只认精确信号集合 `{40014, 40015, 88, 401}`，**不再用 `errmsg.includes('token')` 模糊匹配**
  ——否则 v1.0 的 403 权限错误（`Forbidden.AccessDenied.AccessTokenPermissionDenied`）会被误判为 token 失效而重试。

### 投递终态（asyncsend_v2 的静默失败陷阱）

- asyncsend_v2 是**异步任务**：`errcode:0 + task_id` 只代表「已受理」，**不代表已送达**。
- 实测：发给不存在的 userid 仍返 `errcode:0`，只有 **getsendresult** 的 `invalid_user_id_list` /
  `failed_user_id_list` 才暴露失败。故 MessageCap 必须提供 getSendResult/getSendProgress，
  否则推送失败会被静默记成成功。

### fetchAllContacts（一口气拉完整个通讯录）

- BFS 递归部门树（listsub）+ 每部门游标翻页（user/list）+ **按 userid 去重**（实测同一人可属多个部门）。
- **跳过负数 dept_id**：钉钉保留子树（如「家校通讯录」dept_id=**-7**）不能用普通部门 API 递归
  （实测 listsub(-7) → `40009 illegal deptId`），否则污染 truncated/errors。
- 个别部门失败不中断整体：记入 `errors[]`、`truncated=true`，尽力而为。
- **家校通讯录**（includeFamily）走 edu 专用接口 `GET /v1.0/edu/teachers?pageNumber=&pageSize=`，
  需 `qyapi_addresslist_edu_read` 权限；未开通时**降级**为 `family.available=false`（不抛错），
  企业通讯录部分照常返回。钉钉对该端点可能返明确 403，也可能返模糊 `unknownError`（实测本应用即后者），
  reason 一律透传原始错误 + 附权限申请指引。
  ⚠ edu 成功路径响应形状因无权限未实测，解析为 best-effort，待权限开通后校准。

## 行为
- supports(platform, cap) 类型守卫：capabilities 声明数组包含才可用；钉钉能力按配置动态声明（oauthOrgId 缺失 → 不声明 oauth）
- CorpTokenManager：GET oapi.dingtalk.com/gettoken（appkey/appsecret → access_token 7200s）；缓存 + 提前 300s 刷新 + 并发 single-flight + invalidate() 主动失效
- DingtalkClient：按 host 分流认证（topapi query / v1.0 header）；两套错误约定分别归一为 DingtalkError（v1.0 保留字符串 code）；token 失效精确集合触发 invalidate + 重试一次；外呼经 AbortSignal.timeout 施加超时（timeoutMs，缺省 15s）

## 约束
- 纯 fetch（fetchImpl 注入）；消息体联合类型 text|markdown|link|oa
- topapi 响应为 snake_case（dept_id/has_more/next_cursor/avatar/dept_id_list），client 层归一到契约的 camelCase

## 验收标准

### 桩测试（api.test.ts，44 例，CI 常跑）
- [x] supports 守卫 + 能力动态声明（oauthOrgId 缺失不声明 oauth；声明 message/approval/contacts/apps）
- [x] **认证传输分流**：topapi 请求 access_token 走 query 且 header 无 x-acs；v1.0 反之（根因回归防护）
- [x] CorpTokenManager：TTL 内单请求、single-flight 并发合并、提前 300s 刷新、失效 invalidate、刷新失败旧 token 韧性兜底
- [x] 各端点精确断言完整 URL/method/query/body（**非旧的子串匹配**），topapi snake_case→camelCase 归一
- [x] msg 四种形状 text/markdown/link/oa（link 用 messageUrl）
- [x] getSendResult/getSendProgress：invalid/failed/read/unread 列表归一
- [x] fetchAllContacts：递归 + 去重 + 游标翻页 + 单部门失败不中断 + 跳过负数子树 + 家校降级
- [x] 双 host 错误约定：topapi errcode≠0（HTTP 200）归一；v1.0 403 含字符串 code 且**不**触发 token 重试
- [x] token 失效（40014）自动 invalidate + 重试一次；网络错误归一 DingtalkError(-1) 不误触发重试
- [x] dingtalkOAuth 预设：标准 OIDC mapUser（sub/name/picture），空 picture 归一 undefined

### Live 集成测试（api.live.test.ts，凭证走 env，缺省 skip）
> 桩只能证明「代码符合我以为的契约」；端点是否存在、形状是否对，只有 live 能证明。
> 运行：`DINGTALK_LIVE_APP_KEY=... DINGTALK_LIVE_APP_SECRET=... npx vitest run packages/3p/src/dingtalk/api.live.test.ts`
- [x] listMicroApps：真实返回应用列表（v1.0 header 认证可达）
- [x] fetchAllContacts：真实拉到部门/用户、userid 去重、跳过家校 -7、truncated=false
- [x] getUserDetail + getUserByMobile 闭环（mobile 反查回同一 userid）
- [x] listSubDepts + getDeptDetail + listAdmins 可达
- [x] 审批端点可达（返 403 权限错误而非 NotFound，证明端点与认证都对）
- [x] sendWorkNotice + getSendResult：真发一条给自己并确认送达（需显式 opt-in AGENT_ID + SELF_USERID）
- [x] 家校通讯录降级（无 edu 权限时 available=false，企业部分不受影响）
