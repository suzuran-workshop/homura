# Suzuran Cloud 前端待办清单

> 本文档记录 React 前端（洁净室重写）的实施进度。

## 🎯 项目结构

```
frontend/app/                 # React 18 单页应用（三端共用）
├── src/
│   ├── views/                # 页面组件
│   │   ├── Login.tsx         # 登录页（密码 + Passkey + 钉钉 OAuth）
│   │   ├── Home.tsx          # 首页中转
│   │   ├── Forbidden.tsx     # 403 禁止访问
│   │   ├── NotFound.tsx      # 404 不存在
│   │   ├── Callback.tsx      # OAuth 回调
│   │   ├── OOBE.tsx          # 首次运行向导
│   │   ├── Apps.tsx          # 应用启动台
│   │   ├── DataManager.tsx   # 数据管理浏览器
│   │   └── provider/         # 服务商端视图
│   │       ├── Dashboard.tsx
│   │       ├── AppDetail.tsx
│   │       ├── AppDistribution.tsx
│   │       ├── Organizations.tsx
│   │       ├── OrgDetail.tsx
│   │       ├── MCPTools.tsx
│   │       ├── MCPLogs.tsx
│   │       ├── FileManager.tsx
│   │       ├── Chat.tsx
│   │       └── CompliancePanel.tsx
│   ├── layouts/              # 布局组件
│   │   ├── ProviderLayout.tsx
│   │   └── UserLayout.tsx
│   ├── components/           # 共享组件
│   │   ├── AppShell.tsx
│   │   ├── AppCard.tsx
│   │   ├── NavItem.tsx
│   │   ├── SkipLink.tsx
│   │   ├── DocumentTitle.tsx
│   │   ├── ToastMessage.tsx
│   │   └── org/
│   │       ├── DepartmentManager.tsx
│   │       ├── DepartmentTreeNode.tsx
│   │       ├── MemberManager.tsx
│   │       ├── RoleManager.tsx
│   │       ├── WorkflowManager.tsx
│   │       └── MyTasks.tsx
│   ├── stores/               # Zustand 状态管理
│   │   ├── auth.ts
│   │   └── application.ts
│   ├── api/                  # API 客户端
│   │   ├── client.ts         # Axios 实例
│   │   ├── webauthn.ts       # WebAuthn/Passkey API
│   │   ├── oauth.ts          # OAuth API
│   │   ├── org.ts            # 组织 API
│   │   ├── user.ts           # 用户 API
│   │   ├── department.ts     # 部门 API
│   │   ├── role.ts           # 角色 API
│   │   ├── workflow.ts       # 流程引擎 API
│   │   ├── application.ts    # 应用 API
│   │   ├── mcp.ts            # MCP API
│   │   ├── file.ts           # 文件存储 API
│   │   ├── chat.ts           # AI 对话 API
│   │   ├── compliance.ts     # 合规 API
│   │   ├── oobe.ts           # OOBE API
│   │   ├── data.ts           # 数据管理 API
│   │   └── distribution.ts   # 分发 API
│   ├── hooks/                # React Hooks
│   │   ├── useTheme.ts
│   │   └── useToast.ts
│   ├── utils/
│   │   └── accessibility.ts  # 无障碍工具
│   ├── router/               # React Router 配置
│   │   └── index.tsx
│   ├── i18n.ts               # 国际化（zh/en）
│   └── main.tsx              # 应用入口
└── package.json
```

## 技术栈

| 层面 | 技术 |
|------|------|
| 框架 | React 18 + TypeScript 5 |
| UI 库 | `@fluentui/react-components` v9 (Fluent 2) |
| 图标 | `@fluentui/react-icons` (Fluent System Icons) |
| 路由 | react-router-dom v6 |
| 状态 | Zustand |
| 构建 | Vite 6 + @vitejs/plugin-react |
| HTTP | axios |
| 国际化 | react-i18next |

## ✅ 已完成

### Phase 1: 项目骨架 + Login 试点 ✅
- [x] Vite + React + TypeScript 项目初始化
- [x] FluentProvider + 主题切换（light/dark）
- [x] API 层迁移（从 Vue 版迁移，改 TS 导出风格）
- [x] Zustand stores（auth, application）
- [x] React Router 路由配置 + 导航守卫
- [x] AppShell + NavItem + ToastMessage + useTheme + useToast
- [x] ProviderLayout + UserLayout
- [x] Login 页面（密码 + Passkey + 钉钉 OAuth + 多组织选择器）

### Phase 2: 简单页面 ✅
- [x] Forbidden（静态页）
- [x] NotFound（静态页）
- [x] Home（中转页）
- [x] Callback（OAuth 回调）
- [x] OOBE（首次运行向导，含真实 Passkey 注册）

### Phase 3: 核心业务页面 ✅
- [x] Apps（应用网格 + zip 导入）
- [x] DataManager（数据浏览器 + CRUD）
- [x] Provider Dashboard（监控指标 + 日志查看器）

### Phase 4: 组织管理 ✅
- [x] Organizations（列表 + CRUD）
- [x] OrgDetail（Tab 切换：部门/成员/角色/流程/任务）
- [x] DepartmentManager（递归树 + 对话框）
- [x] DepartmentTreeNode（递归组件）
- [x] MemberManager（表格 + 对话框 + 密码重置）

### Phase 5: 应用管理 ✅
- [x] AppDetail（详情 + 生命周期 + 日志 + 部署历史）
- [x] AppDistribution（分发 + 管理员管理）
- [x] MCPTools（工具卡片网格）
- [x] MCPLogs（审计日志表格）

### Phase 6: 核心特性补全 ✅
- [x] Passkey/WebAuthn 实际集成（`api/webauthn.ts`）
- [x] 多组织密码登录选择器
- [x] 角色管理（"流动职务"模型，`RoleManager.tsx`）
- [x] 流程引擎前端（`WorkflowManager.tsx` + `MyTasks.tsx`）
- [x] 对象存储管理界面（`FileManager.tsx`）
- [x] WAI/WCAG 无障碍合规（SkipLink + ARIA + 键盘导航）
- [x] OpenSuzuran AI 对话界面（SSE 流式，`Chat.tsx`）
- [x] HyperFox 等保合规面板（`CompliancePanel.tsx`）

### 基础设施 ✅
- [x] 国际化（react-i18next，zh/en 双语）
- [x] 文档标题动态切换（DocumentTitle 组件）
- [x] 路由元数据（handle.titleKey）

## 📋 待建设

- [ ] 前端单元测试（vitest）
- [ ] 代码分割（React.lazy + Suspense，优化 bundle 大小）
- [ ] 响应式布局优化（移动端适配）
- [ ] 前端 E2E 测试（Playwright，迁移旧测试用例）
- [ ] 工程化加固：路径别名、env 多环境、bundle 分析、lint

## 🗑️ 已移除（Vue 旧前端）

- ~~Vue 3 + Vite + Vuetify/Pinia 前端~~（2026-08-27 删除）
- ~~Playwright E2E 测试（Vue 版）~~
