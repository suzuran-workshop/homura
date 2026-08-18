# Suzuran Cloud 开发规范

> 本文档定义代码风格、架构约定和最佳实践。

## 🎯 项目定位

Suzuran Cloud 是一个 **AI 原生的多租户 SaaS 应用平台**：Agent 通过 Skill/MCP 契约直接开发并部署应用，应用运行在平台内、共享同一数据层。

**非目标**：低代码拖拽平台、可视化工作流编辑器、报表设计器。

## 📐 代码风格

### Go 代码规范

1. **格式化**：使用 `gofmt`，缩进用 tab
2. **命名**：
   - 包名小写、单数（`service` 而非 `services`）
   - 导出标识符使用 CamelCase
   - 私有标识符使用 camelCase
3. **错误处理**：
   ```go
   if err != nil {
       return fmt.Errorf("failed to create org: %w", err)
   }
   ```
4. **Context 传递**：所有数据库/网络操作第一个参数必须是 `ctx context.Context`

### 目录结构约定

```
internal/
├── handler/      # HTTP 处理器（薄层，只做参数绑定）
├── service/      # 业务逻辑（核心，可测试）
├── repository/   # 数据访问层（GORM 操作）
├── model/        # GORM 模型定义
├── middleware/   # Gin 中间件
├── mcp/          # MCP Server 实现（tools/resources/prompts）
├── runtime/      # 应用运行时（沙箱、生命周期管理）
├── oauth/        # OAuth IdP 实现（WebAuthn、钉钉、token）
└── pkg/          # 工具包（jwt, redis, webauthn）
```

**规则**：
- Handler 不得直接调用 Repository
- Service 不得直接访问 `*gin.Context`
- Model 只包含结构体定义，不含业务逻辑
- MCP tool 内部必须做权限校验（基于 OAuth token）

## 🏛️ 架构原则

### 三层架构

```
Handler → Service → Repository → Database
```

| 层级 | 职责 | 示例 |
|------|------|------|
| Handler | 参数绑定、验证、HTTP 响应 | `auth_handler.go` |
| Service | 业务逻辑、事务管理 | `auth_service.go` |
| Repository | GORM CRUD 操作 | `org_repository.go` |

### 依赖注入

在 `main.go` 中显式构造：

```go
orgRepo := repository.NewOrgRepository(db)
orgService := service.NewOrgService(orgRepo)
orgHandler := provider.NewOrgHandler(orgService)
```

**禁止**使用全局变量或 init() 函数隐式初始化。

### MCP Server 设计

- 每个 tool 是一个独立的函数，有明确的输入/输出 JSON Schema
- Tool 内部必须做权限校验（从 OAuth token 中提取 org_id/user_id）
- Tool 之间不能直接调用，必须通过 Service 层
- 所有 tool 调用都记录审计日志

### 应用运行时设计

- 每个应用运行在独立沙箱中（进程/容器级别隔离）
- 应用通过 MCP Server 访问数据，不能直接连数据库
- 应用间不能直接 HTTP 调用，必须通过 MCP 中转
- 平台管理应用的生命周期（创建、部署、启停、升级、销毁）

## 🛡️ 安全规范

### 鉴权

- **多方法登录**：用户名/密码（bcrypt，主方式）+ WebAuthn + 钉钉 OAuth
- **Token 管理**：access_token（JWT，短期）+ refresh_token（长期，可撤销）
- **Token 存储**：前端使用 httpOnly cookie，不用 localStorage

### 角色模型

- **仅两种角色**：`provider`（org 1 成员，服务商）与 `tenant`（其他组织成员）
- **禁止**引入 tenant_admin / dept_manager 角色及其门户（已在 2026-08-18 废除）
- **应用管理员**：per (组织, 应用)，存 `application_admins` 表，由服务商门户【应用分发】设置；拥有该组织下该应用数据的全部读写权限（REST `/api/data/*`）
- **服务商隐式应用管理员**：provider 不需要 application_admins 记录
- **应用分发**：多对多（`application_distributions`），一个应用可分发到多个组织，数据行按 `org_id` 隔离

### 多租户隔离

- 所有业务表必须有 `org_id` 字段
- 所有查询必须加 `WHERE org_id = ?`（在 Repository 层强制执行）
- 审计日志记录所有数据操作（谁、什么时候、做了什么）

### 数据安全

- 敏感数据加密存储（WebAuthn credential、OAuth token secret）
- 文件存储按 org_id 前缀隔离（MinIO bucket 路径）
- 数据库连接池按 org_id 限制（防止单租户耗尽连接）

### SQL 注入防护

- **禁止**字符串拼接构建 SQL
- **必须**使用 GORM 参数化查询或 JSONB 操作

## 🧪 测试规范

### 单元测试

- 每个 Service 必须有对应的 `_test.go`
- 文件命名：`{module}_test.go`
- 覆盖率目标：80%+
- 使用 `testify/assert` 和 `testify/require`
- 使用 SQLite 内存数据库（`gorm.io/driver/sqlite`）
- Mock 外部依赖（Redis、MinIO、钉钉 API）

### 集成测试

- MCP tool 必须有集成测试（验证权限校验、数据隔离）
- OAuth 流程必须有集成测试（WebAuthn ceremony、钉钉 OAuth）
- 应用生命周期必须有集成测试（创建、部署、启停）

### E2E 测试

- 前端使用 Playwright
- 覆盖核心流程：登录、创建应用、部署应用、访问应用

## 📦 依赖管理

### Go 依赖

- 使用 `go mod tidy` 清理无用依赖
- 定期更新依赖（`go get -u`）
- 不引入重型依赖（Keycloak、Authentik 等第三方 IdP）

### 前端依赖

- 使用 `npm install` 安装依赖
- 定期更新依赖（`npm update`）
- 不引入低代码相关依赖（拖拽库、可视化工作流库）

## 🚫 禁止事项

- ❌ 低代码拖拽设计器（FormDesigner、widget_library）
- ❌ 可视化工作流编辑器
- ❌ 报表设计器
- ❌ JSON schema 动态表单渲染
- ❌ 明文/弱哈希存密码（必须 bcrypt）
- ❌ 第三方 IdP 集成（Keycloak、Authentik）
- ❌ 应用直接连数据库（必须走 MCP）
- ❌ 应用间直接 HTTP 调用（必须通过 MCP 中转）
- ❌ 重新引入 tenant_admin / dept_manager 角色或租户管理门户

## 📝 文档规范

每个模块必须有对应文档：

- `README.md`：项目是什么？怎么运行？当前状态？
- `AGENTS.md`：代码规范、架构约定（本文件）
- `docs/PRD.md`：产品需求、功能意义
- `docs/ARCHITECTURE.md`：架构地图、系统边界
- `docs/DECISIONS.md`：设计决策记录
- `docs/specs/*.md`：具体实现规范（每个 spec = 一个 Agent 任务）

## 🚀 部署检查清单

- [ ] `.env` 中修改敏感配置（DB_PASSWORD、JWT_SECRET、WEBAUTHN_RP_ID）
- [ ] 运行 `docker-compose up -d`
- [ ] 验证健康检查：`curl http://localhost:8888/health`
- [ ] 检查日志：`docker-compose logs -f backend`
