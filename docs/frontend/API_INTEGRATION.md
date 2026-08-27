# Suzuran Cloud 前端 API 集成指南

> 本文档说明 React 前端（Fluent UI）与后端 API 的集成方式。

## 🔧 开发环境准备

### 1. 启动后端服务

```bash
# 启动基础设施
docker compose up -d postgres redis minio

# 启动后端（端口 8888）
cd backend
go run cmd/api/main.go
```

### 2. 启动前端开发服务器

```bash
cd frontend/app
npm install
npm run dev   # 端口 5173
```

## 📡 API 配置

### 环境变量

`frontend/app/.env.development`：

```env
VITE_API_BASE_URL=http://localhost:8888
```

### API 模块

| 模块 | 职责 |
|------|------|
| `src/api/client.ts` | Axios 实例 + access_token 自动刷新（httpOnly cookie / refresh token） |
| `src/api/webauthn.ts` | WebAuthn/Passkey 注册/登录 ceremony |
| `src/api/oauth.ts` | 钉钉 OAuth 跳转、session token 交换 |
| `src/api/org.ts` | 组织 CRUD（provider 门户） |
| `src/api/user.ts` | 成员管理 |
| `src/api/department.ts` | 部门树与管理 |
| `src/api/role.ts` | 角色管理（流动职务） |
| `src/api/workflow.ts` | 流程引擎（定义、实例、任务） |
| `src/api/application.ts` | 应用管理 + 部署/生命周期 |
| `src/api/mcp.ts` | MCP 工具浏览、MCP 调用日志查看 |
| `src/api/file.ts` | 对象存储文件管理 |
| `src/api/chat.ts` | AI 对话（SSE 流式） |
| `src/api/compliance.ts` | 等保合规报告 |
| `src/api/data.ts` | 数据管理浏览器 |
| `src/api/distribution.ts` | 应用分发 |

## 🔐 认证流程

平台使用自建 OAuth IdP，支持三种登录方式：

1. **用户名/密码登录** — 主登录方式，多组织用户会显示组织选择器
2. **Passkey (WebAuthn)** — 浏览器本地凭据，无密码
3. **钉钉 OAuth** — 钉钉扫码授权

### Token 机制

access_token（JWT, 15min）+ refresh_token（30d, 可吊销）。前端通过 httpOnly cookie 持有 refresh_token。

```
POST /oauth/session/token  →  { access_token, refresh_token, user, orgs }
```

access_token 过期时，`client.ts` 的拦截器自动用 refresh_token 调 `POST /oauth/token`（grant_type=refresh_token）换取新令牌。

## 🚀 路由守卫

| 路由 | 要求角色 |
|------|----------|
| `/login`、`/oobe`、`/oauth/callback` | 仅未登录可访问 |
| `/provider/*` | `provider` |
| `/user/*` | 任意已登录用户 |
| `/forbidden` | 403 兜底页 |

## 🧪 测试

- **构建**：`npm run build`（tsc + vite build）
- **单元测试**：vitest（待补）
- **E2E 测试**：Playwright（待迁移）
