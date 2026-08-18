# Suzuran Cloud ☁️

> 一个 AI 原生的多租户 SaaS 应用平台

## 🎯 项目简介

Suzuran Cloud 是一个 **AI 原生的多租户 SaaS 应用平台**：Agent 通过 Skill/MCP 契约直接开发并部署应用，应用运行在平台内、共享同一数据层。

**核心价值主张**：

- **对 Agent**：一行代码接入（`import { createApp } from '@suzuran/sdk'`），零依赖 SDK，自动鉴权，23 个标准化 MCP tools 覆盖组织/用户/部门/文件/审计全场景
- **对企业**：统一身份认证（WebAuthn + 钉钉 OAuth），组织架构自动同步，应用间数据共享（无数据孤岛），全链路审计可追溯
- **对服务商**：容器化沙箱隔离，资源配额管理，MCP 契约平台，Agent 赋能生态

**为什么不是低代码**：Vibe Coding 的兴起让拖拽设计器失去优势，Agent 生成的代码可以任意复杂，而低代码产出的应用受限于平台 DSL。Suzuran Cloud 从"让人拖拽搭应用"转向"让 Agent 写代码跑应用"。

## 🏗️ 技术栈

| 层级 | 技术 |
|------|------|
| **后端** | Go 1.26 + Gin + GORM |
| **数据库** | PostgreSQL 15 (JSONB + GIN 索引) |
| **缓存** | Redis 7 (Session、MCP 限流) |
| **对象存储** | MinIO (S3 兼容) |
| **鉴权** | OAuth2 + WebAuthn (go-webauthn) |
| **MCP** | mark3labs/mcp-go |
| **应用运行时** | Docker / gVisor（待定） |
| **前端** | Vue 3 + Vite + Vuetify + Pinia |
| **容器化** | Docker Compose |

## 📦 快速开始

### 前置条件

- Docker & Docker Compose v2+
- Go 1.26+（可选，用于本地开发）
- Node.js 18+（前端开发）

### 启动服务

```bash
# 克隆仓库
git clone https://github.com/xrl/suzuran-cloud.git
cd suzuran-cloud

# 复制环境变量
cp .env.example .env

# 启动基础设施（PostgreSQL、Redis、MinIO）
docker-compose up -d postgres redis minio

# 启动后端
cd backend
go run cmd/api/main.go

# 启动前端（另一个终端）
cd frontend/app
npm install
npm run dev
```

### 访问端口

| 服务 | 端口 | 说明 |
|------|------|------|
| Backend API | `8888` | Go + Gin RESTful API |
| PostgreSQL | `5432` | 主数据库 |
| Redis | `6379` | Session 缓存 |
| MinIO Console | `9001` | 对象存储管理界面 |
| Frontend | `3000` | 三端门户（provider/tenant/user） |

## 🚀 当前状态（2026-08-18）

项目已从低代码平台成功转型为 AI 原生应用平台。

**已完成**：
- ✅ 多租户基座（org/user/bond/dept + JWT + tenant 中间件）
- ✅ 三层架构（handler/service/repository/model）
- ✅ 基础 API（组织管理、用户管理、部门管理）
- ✅ 认证 IdP（用户名/密码为主，WebAuthn + 钉钉 OAuth 补充）
- ✅ 角色体系（仅 provider/tenant；应用管理员 per 组织 × 应用）
- ✅ 应用分发（多对多：一个应用分发到多个组织）+ 应用管理员设置
- ✅ 应用导入（zip 上传，代码包存对象存储，不依赖宿主路径；REST + MCP `app.import` 双通道）
- ✅ 数据管理 API（REST，应用管理员/provider 可读写分发应用数据）
- ✅ MCP Server（23 个 tools + 9 个 prompts + 4 个 schema resources）
- ✅ 应用运行时（Docker 容器管理，生命周期管理，沙箱隔离，资源配额，OAUTH_TOKEN 注入）
- ✅ 应用启动台前端（按分发关系展示，含数据管理入口）
- ✅ Skill/MCP 契约文档（v1.1.0，含示例应用）
- ✅ **@suzuran/sdk v1.0.0**（零依赖 Node.js SDK，MCP 客户端 + HTTP 路由 + 生命周期管理）

**待建设**：
- ⏳ 应用详情页增强（部署历史、日志查看 UI）
- ⏳ MCP 工具独立集成测试
- ⏳ workflow 通知接入（in-app channel）

## 📚 文档

- [PRD](docs/PRD.md) — 产品需求文档
- [ARCHITECTURE](docs/ARCHITECTURE.md) — 架构地图
- [DECISIONS](docs/DECISIONS.md) — 设计决策记录
- [AGENTS](AGENTS.md) — 开发规范
- [Specs](docs/specs/) — 具体实现规范

## 🛡️ 安全

- **角色**：仅 provider（org 1 成员）与 tenant；应用管理员（per 组织 × 应用）拥有应用数据全部读写权限，服务商隐式拥有
- **多租户隔离**：所有业务表有 `org_id` 字段，查询自动加 `WHERE org_id = ?`
- **审计日志**：所有数据操作都有记录（谁、什么时候、做了什么）

## 🧪 测试

```bash
# 后端单元测试
cd backend
go test ./... -v -race

# 前端 E2E 测试
cd frontend/app
npx playwright test
```

## 📄 License

MIT
