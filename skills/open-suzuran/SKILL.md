---
name: open-suzuran
description: >
  Suzuran Cloud 平台服务商 AI 操作技能。通过 MCP Server（/mcp，Bearer token）直达平台：
  上架/更新/删除应用、部署与生命周期、应用分发与管理、组织/用户/部门管理、数据与流程操作、审计查询。
  当用户提到"suzuran"、"开放平台"、"上架应用"、"发布应用"、"open-suzuran"、或要求操作 Suzuran Cloud 平台资源时使用；
  以下情况不要触发：只是讨论通用代码、非 Suzuran 平台产品或仅解释概念。
---

# Suzuran Cloud 服务商操作指南（open-suzuran）

通过 MCP Server 一句话完成应用上架、改版、分发、组织管理等平台运营操作。
所有平台操作走 **MCP tools（JSON-RPC POST /mcp）**；REST 仅用于登录与写操作后的只读复核。

---

## 语言与完成性

- 默认沿用用户语言输出；中文用户用中文。工具名（`app.import`）、参数名（`orgId`）、API 路径保持英文。
- 写操作必须跑到验收闭环：导入后 `app.get` 复核，分发后 `app.list_distributions` 复核，删除后确认 404。只做规划或只读操作不能宣称完成。
- 平台部署依赖 Docker 运行时：若后端返回 `runtime manager not available` / `docker client not available`，说明部署能力未启用（本地 Windows 开发环境无容器），如实告知用户，不视为功能故障。

---

## 第一步：登录态预检

脚本：`scripts/login.ps1`（密码登录 → token 文件），`scripts/mcp.ps1`（统一工具调用）。

```powershell
# 登录（默认 http://localhost:8888，xrl/demo1234）
.\scripts\login.ps1 -Username xrl -Password demo1234            # 可选 -BaseUrl -OrgId
# 调用工具（读取 token 文件）
.\scripts\mcp.ps1 -Tool app.list -Args '{"orgId":1}'
```

- token 文件：`~/.suzuran/token.json`（access_token + org_id + 过期时间）。access_token 约 15 分钟过期；过期后重新 `login.ps1`。
- 未登录/登录失败：先跑 `login.ps1`，不要跳过认证直接调工具。

---

## 工具路由

MCP 共 **64 个工具**，按任务选择，禁止无关工具：

| 任务 | 工具 |
|---|---|
| 应用上架（新应用） | `app.import`（orgId, zipBase64） |
| 应用改版（更新代码） | `app.update_code`（appId, zipBase64）→ 重新部署生效 |
| 应用元数据 | `app.update`（name/version/runtime/entrypoint/port/mcpScopes/配额） |
| 应用查看 | `app.list`（orgId）、`app.get`（appId） |
| 部署与生命周期 | `app.deploy`、`app.start`、`app.stop`、`app.restart`、`app.status`、`app.logs`、`app.deployments` |
| 应用删除 | `app.delete`（级联清理分发/管理员） |
| 应用分发 | `app.distribute`、`app.undistribute`、`app.list_distributions`（provider 角色，`targetOrgId`） |
| 应用管理员 | `app.set_admin`、`app.remove_admin`（targetOrgId, userId） |
| 组织 | `org.get/list/create/update/delete`（list/create/update/delete 仅 provider） |
| 用户 | `user.list_members`、`user.create_member`、`user.update_member`、`user.remove_member` |
| 部门 | `dept.list/get/tree/create/update/delete/set_manager` |
| 数据 | `data.create_table`、`data.query/insert/batch_insert/update/delete/count`、`data.add_column`、`data.list_tables`、`data.describe_table`、`data.drop_table`、`data.exec_raw` |
| 流程 | `workflow.define/start/approve/reject/cancel/get_instance/list_instances/list_tasks/...`（11 个） |
| 文件 | `file.upload/download/delete/list/presigned_url` |
| 审计 | `audit.query`（orgId/action/resourceType 过滤） |

**权限边界**：读类工具 scope `org.read`、写类 `org.write`；跨组织操作（分发/设管理员）需 provider 角色且参数为 `targetOrgId`。非服务商 token 会被拒绝（`access denied to org` / `insufficient scope` / `insufficient role`），照实反馈。

---

## 常用工作流

### 1. 上架新应用（服务商）

```powershell
# 打包代码（zip 根目录必须含 app.json，字段：name/runtime/entrypoint/port/mcp_scopes）
Compress-Archive -Path "$src\*" -DestinationPath "$env:TEMP\app.zip"
# 导入（scripts/import-zip.ps1 封装 base64 + app.import）
.\scripts\import-zip.ps1 -ZipPath "$env:TEMP\app.zip" -OrgId 1     # 新应用
.\scripts\import-zip.ps1 -ZipPath "$env:TEMP\app.zip" -AppId <id>  # 更新现有应用代码
```

1. 校验 zip 根有 `app.json`（缺失/非法会报错）
2. `app.import` → 记录返回的 `appId`
3. `app.get <appId>` 复核（version/sourceKey 已落库）
4. 需要上线运行再 `app.deploy`（需 Docker 运行时）

同名应用（同 org）重复导入会被拒（`already exists`）；改版请用 `app.update_code`。

### 2. 分发应用给租户

1. `org.list` 找到目标租户 orgId（或 `user.list_members` 确认成员）
2. `app.distribute {appId, targetOrgId}` → 租户启动台可见
3. `app.set_admin {appId, targetOrgId, userId}` 授予数据管理权限（用户须是该 org 成员）
4. `app.list_distributions {appId}` 复核（orgName + admins）
5. 取消：`app.remove_admin` → `app.undistribute`

### 3. 组织与成员管理

- 新建组织：`org.create {name}` → `user.create_member {orgId, phone, name, username?, password?}` 添加成员
- 查询组织：`org.list`（仅 provider）
- 部门树：`dept.tree {orgId}` / `dept.create {orgId, name, parentDeptId?}`

### 4. 应用数据操作（调试/代运营）

- 先 `data.list_tables {orgId, appId}`（注意：data 工具按调用方身份定 app 归属）
- `data.query {orgId, appId, tableName, filters?, limit?, offset?}` / `data.insert` / `data.update` / `data.delete`

---

## 错误速查

| 错误 | 含义与处理 |
|---|---|
| `invalid or expired token` | token 过期 → 重跑 `login.ps1` |
| `insufficient scope: xxx` | token 缺少该操作 scope → 用更高权限账号 |
| `access denied to org` / `access denied to app` | 调用者不是该 org 成员/应用归属不匹配 |
| `insufficient role` | 该操作仅 provider（org 1 成员） |
| `application already exists in this organization` | 同名导入被拒 → 用 `app.update_code` |
| `runtime manager not available` | 后端未配置容器运行时（部署能力未启用） |
| `package is missing app.json` / `unsafe path` | zip 不合法或含路径穿越 → 修复后重试 |

## 附

- 完整工具清单与参数：`docs/mcp-tools.md`
- 演示环境：后端 `http://localhost:8888`、前端 `http://localhost:5173`；provider 账号 xrl/demo1234（org 1）、租户 tenantone/tenant123（org 2）
- 平台不支持：低代码拖拽设计器、可视化工作流、报表设计器（见 AGENTS.md Non Goals）