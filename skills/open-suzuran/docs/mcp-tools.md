# MCP Tools 目录（64 个）

全部工具走 JSON-RPC `POST /mcp`，请求体：

```json
{ "jsonrpc": "2.0", "id": 1, "method": "tools/call",
  "params": { "name": "app.list", "arguments": { "orgId": 1 } } }
```

Header：`Authorization: Bearer <access_token>`

## App（18）— scope org.read / org.write

| 工具 | 必需参数 | 可选 | 说明 |
|---|---|---|---|
| app.import | orgId, zipBase64 | | 导入新应用（zip 根须含 app.json） |
| app.list | orgId | | 列出组织下应用 |
| app.get | appId | | 应用详情 |
| app.update | appId | name/version/runtime/entrypoint/port/cpuQuota/memoryQuota/dbConnQuota/mcpScopes | 元数据更新 |
| app.delete | appId | | 删除（级联清分发/管理员） |
| app.update_code | appId, zipBase64 | | 替换代码包（同步 manifest version） |
| app.deploy | appId | | 部署（注入调用者 token 为 OAUTH_TOKEN） |
| app.start / app.stop / app.restart | appId | | 容器启停 |
| app.status | appId | | 容器状态 |
| app.logs | appId | tail | 容器日志 |
| app.deployments | appId | | 部署历史 |
| app.distribute | appId, targetOrgId | | 分发（provider） |
| app.undistribute | appId, targetOrgId | | 取消分发（provider） |
| app.list_distributions | appId | | 分发列表 + 管理员 |
| app.set_admin / app.remove_admin | appId, targetOrgId, userId | | 应用管理员（provider） |

## Org（5）— org.read / org.write（create/update/delete 仅 provider）

org.get（orgId）、org.list、org.create（name, description?）、org.update（orgId）、org.delete（orgId）

## User（4）— org.read / org.write

user.list_members（orgId）、user.create_member（orgId, phone, name, username?, password?）、user.update_member（orgId, userId）、user.remove_member（orgId, userId）

## Dept（7）— org.read / org.write

dept.list（orgId）、dept.get（deptId）、dept.tree（orgId）、dept.create（orgId, name, parentDeptId?）、dept.update（deptId）、dept.delete（deptId）、dept.set_manager（deptId, managerUserId）

## File（5）— file.read / file.write

file.upload（orgId, fileName, fileBase64, contentType）、file.download（objectKey）、file.delete（objectKey）、file.list（orgId）、file.presigned_url（objectKey）

## Data（12）— data.read / data.write

data.create_table（orgId, appId, tableName, columns[]）、data.drop_table、data.list_tables、data.describe_table、data.query（filters?/limit?/offset?）、data.insert（data{}）、data.batch_insert（rows[]）、data.update、data.delete、data.count、data.add_column、data.exec_raw

## Workflow（11）— workflow.read / workflow.write

workflow.define、workflow.get_definition、workflow.list_definitions、workflow.archive、workflow.start、workflow.get_instance、workflow.list_instances、workflow.cancel、workflow.list_tasks、workflow.approve、workflow.reject

## Audit（2）— audit.read / audit.write

audit.query（orgId?, userId?, action?, resourceType?, startTime?, endTime?, limit?, offset?）、audit.log（orgId, action, resourceType）

## 权限速查

- scope 不足 → `insufficient scope`
- 跨 org 访问 → `access denied to org`；app 归属不符 → `access denied to app`
- provider-only（org.list/create/update/delete、app.distribute/undistribute/set_admin/remove_admin）→ 需 role=provider，否则 `insufficient role`