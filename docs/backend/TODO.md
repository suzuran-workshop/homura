# Suzuran Cloud 后端待办清单

> 本文档记录 AI 原生应用平台的后端实施进度。

## ✅ 已完成

### 多租户基座（100%）
- [x] Go 项目骨架（cmd、internal、pkg 目录结构）
- [x] GORM 模型定义（Org、User、OrgUserBond、Department、AuditLog、DingTalkSyncLog）
- [x] Repository 层（org、user、bond、department、dingtalk_sync_log）
- [x] Service 层（auth、org、department、user、dingtalk_sync）
- [x] Middleware 层（auth、tenant context、CORS、permissions、audit）
- [x] Handler 层（auth、provider/org、provider/org_member、tenant/user、tenant/department）
- [x] Pkg 层（jwt、password、redis、dingtalk client/bot_client）
- [x] Main.go（依赖注入 + 路由配置）
- [x] JWT 认证中间件 + Redis token 存储
- [x] 租户上下文中间件
- [x] 文件存储（MinIO 集成）
- [x] 系统监控（内存/磁盘/DB 连接池指标）
- [x] 日志系统（内存环形缓冲 + 文件落盘）

### 数据库（100%）
- [x] 初始化脚本（docs/sql/init.sql）— 仅含多租户核心表
- [x] 演示数据种子（docs/sql/seed_demo_data.sql）
- [x] JSONB 类型兼容（PostgreSQL jsonb + SQLite text fallback）

### 测试（100%）
- [x] 所有 Service 单元测试
- [x] 所有 Repository 单元测试
- [x] Handler 层单元测试
- [x] Middleware 单元测试
- [x] E2E 集成测试（auth flow、org management、department management、multi-tenant isolation）

## ⏳ 待建设（按 Spec 编号）

### Spec 02: OAuth IdP（✅ 已完成）
- [x] WebAuthn credential 数据模型
- [x] OAuth client 数据模型
- [x] OAuth token 数据模型
- [x] WebAuthn 注册/登录 ceremony
- [x] 钉钉 OAuth 完整实现（authorization_code 流程）
- [x] OAuth2 端点（/oauth/authorize、/oauth/token、/oauth/revoke）
- [x] Token 管理（RS256 JWT + refresh token）
- [x] OAuth 中间件（替换现有 JWT 中间件）
- [x] 移除密码登录（users 表无 password_hash/salt 字段）
- [x] 前端登录页更新（WebAuthn + 钉钉按钮）
- [x] 会话令牌端点（/oauth/session/token，登录→token 桥梁）

### Spec 03: MCP Server（✅ 已完成）
- [x] MCP Server 核心（mark3labs/mcp-go v0.17.0）
- [x] 基础数据 tools（org/user/department CRUD）
  - [x] org.get, org.list, org.create, org.update, org.delete
  - [x] user.list_members, user.create_member, user.update_member, user.remove_member
  - [x] dept.list, dept.get, dept.tree, dept.create, dept.update, dept.delete, dept.set_manager
- [x] 文件存储 tools（file.upload, file.download, file.delete, file.list, file.presigned_url）
- [x] 审计日志 tools（audit.query, audit.log）
- [x] 数据查询 tools（query/mutate/subscribe）— 待 Spec 04 实现
- [x] 权限校验（基于 OAuth token + scope 验证）
- [x] Rate limiting（Redis 滑动窗口限流，100 次/分钟）
- [x] MCP HTTP 端点（POST /mcp, GET /mcp/tools）
- [x] MCP resources（schema 文档：org/user/department/application JSON Schema）
- [x] MCP prompts（9 个 Agent 调用指南：list-organizations, create-user, manage-departments, upload-file, query-audit-logs, authentication, develop-app, mcp-tools-catalog, data-query）
- [x] 审计日志记录（每次 tool 调用自动记录）
- [x] 跨平台编译支持（Linux/Windows/macOS）

### Spec 04: 应用运行时（✅ 已完成）
- [x] Application 数据模型（新定义，非低代码的 application）
- [x] ApplicationDeployment 数据模型
- [x] RuntimeManager（Docker API 管理容器生命周期）
- [x] Sandbox（容器隔离、网络隔离、卷管理）
- [x] 资源配额（CPU/内存/数据库连接）
- [x] 应用路由（外部请求 → 应用容器，AppRouter 反向代理）
- [x] 应用管理 API（create/deploy/start/stop/restart/delete/status/logs/deployments）
- [x] DockerClient 接口抽象（跨平台编译，Windows stub / Linux 完整实现）

### Spec 05: Skill/MCP 契约文档（✅ 已完成）
- [x] MCP tools JSON Schema（覆盖全部 tools，含 input/scope/role）
- [x] OAuth 流程文档（WebAuthn + 钉钉 OAuth + session/token 交换 + 刷新 + 撤销）
- [x] 应用 SDK 文档（安装、初始化、MCP 调用、HTTP 路由、生命周期、运行时环境变量）
- [x] 数据模型 Schema（org/user/department/application）
- [x] 应用清单 Schema（app-manifest.json）
- [x] 示例应用（hello-world：app.json + server.js + package.json + README）
- [x] 契约文档发布到 `docs/contracts/` 目录
- [x] 契约文档版本控制（v1.1.0，SemVer）

### Spec 06: 流程引擎（✅ 已完成）
- [x] WorkflowDefinition / WorkflowInstance / WorkflowTask 数据模型（org_id 隔离）
- [x] Repository 层（definition/instance/task，全部带 org_id 过滤）
- [x] WorkflowService（状态机 + 条件评估 + 通知集成）
- [x] 条件评估器（轻量表达式：> < >= <= == !=）
- [x] 11 个 MCP 工具（workflow.define/get_definition/list_definitions/archive/start/get_instance/list_instances/cancel/list_tasks/approve/reject）
- [x] 接入 MCP 管道（鉴权/限流/审计自动生效）
- [x] MCP prompt（workflow-guide）
- [x] 单元测试（状态机全路径 + 条件评估）
- [x] 契约 schema（workflow_definition/instance/task）+ mcp-tools.json 更新

### 工程加固（2026-08-13，✅ 已完成）
- [x] 修复 OrgMgmtHandler 角色判断 bug（移除 handler 层 checkRole，权限由中间件统一控制）
- [x] `/api/system/*` 挂载 RequireOrgAdmin 中间件
- [x] MCP 工具管道接通 RateLimiter + AuditService（之前 nil-guarded 失效）
- [x] CI/CD 流水线（GitHub Actions：Go vet/lint/test/build + Frontend tsc/build + SDK tsc/test）
- [x] Lint 配置（golangci-lint + ESLint + Prettier）
- [x] 过期文档清理（DEMO_ACCOUNTS.md / API_INTEGRATION.md 重写为 OAuth 现状）

### 角色体系收敛 + 应用分发（2026-08-18，✅ 已完成）
- [x] 角色收敛为 provider/tenant（删除 tenant_admin/dept_manager 角色分支、RequireDeptManager 中间件）
- [x] JWT 角色解析简化（org 1 成员 = provider，其余 = tenant；is_admin 不再影响角色）
- [x] 租户门户删除（/tenant 路由、TenantLayout、tenant 目录页面）
- [x] ApplicationDistribution 模型 + repository（多对多分发）
- [x] ApplicationAdmin 模型 + repository（per 组织 × 应用的管理员）
- [x] DistributionService（分发/取消分发/设管理员/权限判定/租户应用列表）
- [x] 分发 REST API（provider 门户：list/distribute/undistribute/admins CRUD）
- [x] 数据管理 REST API（/api/data/*，授权 = provider 或应用管理员，复用 DataService）
- [x] /api/apps 按分发关系返回 + isAdmin 标记
- [x] 前端【应用分发】页面（provider 门户）
- [x] 前端数据管理页面（应用管理员 + provider）
- [x] 迁移 002_app_distribution.sql + init.sql 更新
- [x] workflow assignee 角色型指派废除（仅 user 类型）

## ❌ 已移除（低代码资产）

- ~~FormDefinition、FormSubmission、FormDistribution~~
- ~~Application（低代码版）、ApplicationPage、WidgetLibrary~~
- ~~ReportDefinition~~
- ~~FormService、ApplicationService、ReportService~~
- ~~ApplicationHandler、FormHandler~~
- ~~crudgen 代码生成器~~

> 注：低代码版 WorkflowEngine 已移除，但流程能力以 AI 原生方式（JSON 定义 + MCP 工具）在 Spec 06 重新实现。

## 📋 技术债务

- [x] ~~Permission 中间件挂载到路由~~（已完成）
- [ ] MCP 工具集成测试（spec 03 完成标准提及，尚未补独立集成测试文件）
- [ ] NotificationService 的 in-app channel 接入（workflow 审批通知目前为 no-op）
- [ ] workflow 超时/SLA 自动升级（v2 扩展）
