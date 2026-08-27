# Spec 04: 应用运行时（沙箱隔离 + 生命周期管理）

> 应用运行在平台管理的沙箱中，平台管理应用的生命周期

## 目标

实现应用运行时，让 Agent 开发的应用能够部署在平台内运行，享受沙箱隔离、资源配额、生命周期管理。

## 技术选型

| 组件 | 选型 | 原因 |
|------|------|------|
| 沙箱 | Docker（初期）/ gVisor（后期） | Docker 成熟，gVisor 更安全 |
| 进程管理 | Docker API | 通过 API 管理容器生命周期 |
| 资源配额 | Docker cgroup | 限制 CPU/内存 |
| 网络隔离 | Docker network | 每个应用独立网络 |

## 应用定义

### 应用清单（`app.json`）

```json
{
  "name": "crm",
  "version": "1.0.0",
  "runtime": "node:18",
  "entrypoint": "node server.js",
  "port": 8080,
  "resources": {
    "cpu": "0.5",
    "memory": "512Mi",
    "database_connections": 10
  },
  "mcp_scopes": ["org.read", "file.read", "file.write"],
  "routes": [
    { "path": "/api/*", "handler": "http://localhost:8080" }
  ]
}
```

### 应用 SDK（Node.js 示例）

```javascript
import { createApp } from '@suzuran/sdk'

const app = createApp({
  name: 'crm',
  port: 8080,
})

app.get('/api/customers', async (req, res) => {
  // 通过 MCP 访问数据
  const users = await app.mcp.call('org.list_users', { orgId: req.orgId })
  res.json(users)
})

app.start()
```

## 实现清单

### 后端

#### 1. 数据模型

**`model/application.go`**（重新定义，不是低代码的 application）：
```go
type Application struct {
    ID              string `gorm:"primaryKey"`
    OrgID           int    `gorm:"index"`
    Name            string
    Version         string
    Runtime         string // node:18, python:3.11, go:1.21
    Entrypoint      string
    Port            int
    CPUQuota        string
    MemoryQuota     string
    DBConnQuota     int
    MCPScopes       []string `gorm:"type:jsonb"`
    Routes          []Route  `gorm:"type:jsonb"`
    Status          string   // created, running, stopped, error
    ContainerID     string
    CreatedAt       time.Time
    UpdatedAt       time.Time
}

type Route struct {
    Path    string `json:"path"`
    Handler string `json:"handler"`
}
```

**`model/application_deployment.go`**：
```go
type ApplicationDeployment struct {
    ID            string `gorm:"primaryKey"`
    ApplicationID string `gorm:"index"`
    Version       string
    ImageTag      string
    Status        string // building, deploying, running, failed
    CreatedAt     time.Time
    CompletedAt   *time.Time
}
```

#### 2. 应用运行时

**`internal/runtime/manager.go`**：
```go
type RuntimeManager struct {
    docker     *client.Client
    db         *gorm.DB
    minio      *minio.Client
}

func (m *RuntimeManager) CreateApp(ctx context.Context, app *model.Application) error
func (m *RuntimeManager) DeployApp(ctx context.Context, appID string, version string) error
func (m *RuntimeManager) StartApp(ctx context.Context, appID string) error
func (m *RuntimeManager) StopApp(ctx context.Context, appID string) error
func (m *RuntimeManager) RestartApp(ctx context.Context, appID string) error
func (m *RuntimeManager) DeleteApp(ctx context.Context, appID string) error
func (m *RuntimeManager) GetAppStatus(ctx context.Context, appID string) (*AppStatus, error)
```

**`internal/runtime/sandbox.go`**：
```go
type Sandbox struct {
    ContainerID string
    NetworkID   string
    Volumes     []string
}

func (m *RuntimeManager) CreateSandbox(ctx context.Context, app *model.Application) (*Sandbox, error)
func (m *RuntimeManager) DestroySandbox(ctx context.Context, sandbox *Sandbox) error
```

**`internal/runtime/resource_quota.go`**：
```go
func (m *RuntimeManager) ApplyResourceQuota(ctx context.Context, containerID string, quota ResourceQuota) error
func (m *RuntimeManager) CheckResourceUsage(ctx context.Context, containerID string) (*ResourceUsage, error)
```

#### 3. 应用路由

**`internal/runtime/router.go`**：
```go
type AppRouter struct {
    runtimeManager *RuntimeManager
    apps           map[string]*model.Application // appID -> app
}

func (r *AppRouter) HandleRequest(c *gin.Context)
func (r *AppRouter) RegisterApp(app *model.Application)
func (r *AppRouter) UnregisterApp(appID string)
```

外部请求 → API Gateway → AppRouter → 应用容器

#### 4. HTTP 端点

**`internal/handler/provider/app_handler.go`**：
- `POST /api/provider/apps`：创建应用
- `GET /api/provider/apps`：列出应用
- `GET /api/provider/apps/:appId`：获取应用详情
- `PUT /api/provider/apps/:appId`：更新应用
- `DELETE /api/provider/apps/:appId`：删除应用
- `POST /api/provider/apps/:appId/deploy`：部署应用
- `POST /api/provider/apps/:appId/start`：启动应用
- `POST /api/provider/apps/:appId/stop`：停止应用
- `POST /api/provider/apps/:appId/restart`：重启应用
- `GET /api/provider/apps/:appId/status`：获取应用状态
- `GET /api/provider/apps/:appId/logs`：获取应用日志

### 前端

**`frontend/app/src/views/Apps.tsx`**：
- 应用启动台（按分发关系展示，运行中/未运行分组）
- 状态指示条 + 运行时图标
- zip 导入对话框（仅 provider）

**`frontend/app/src/views/provider/AppDetail.tsx`**：
- 应用详情（配置、状态、资源使用）
- 部署历史
- 生命周期控制（启动/停止/重启）
- 日志查看

## 完成标准

- [ ] 应用创建 API 可用（定义应用清单）
- [ ] 应用部署 API 可用（构建镜像、启动容器）
- [ ] 应用启动/停止/重启 API 可用
- [ ] 应用状态 API 可用（running/stopped/error）
- [ ] 沙箱隔离生效（应用间不能互相访问）
- [ ] 资源配额生效（CPU/内存/数据库连接限制）
- [ ] 应用路由生效（外部请求能到达应用）
- [ ] 应用日志可查看
- [ ] 前端应用管理页面可用
- [ ] 单元测试覆盖 RuntimeManager
- [ ] 集成测试覆盖完整流程（创建 → 部署 → 启动 → 访问 → 停止）

## 安全注意事项

- 容器必须用非 root 用户运行
- 容器不能挂载宿主机文件系统
- 容器网络必须隔离（不能访问其他容器）
- 容器资源必须限制（防止单应用耗尽资源）
- 应用代码必须经过安全扫描（防止恶意代码）

## 预计工作量

10-14 天（Agent 执行）
