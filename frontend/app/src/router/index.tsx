import { createBrowserRouter, Navigate, Outlet } from 'react-router-dom'
import { ProviderLayout } from '../layouts/ProviderLayout'
import { UserLayout } from '../layouts/UserLayout'
import { Login } from '../views/Login'
import { Home } from '../views/Home'
import { Forbidden } from '../views/Forbidden'
import { NotFound } from '../views/NotFound'
import { Callback } from '../views/Callback'
import { OOBE } from '../views/OOBE'
import { Apps } from '../views/Apps'
import { DataManager } from '../views/DataManager'
import { Dashboard } from '../views/provider/Dashboard'
import { AppDetail } from '../views/provider/AppDetail'
import { AppDistribution } from '../views/provider/AppDistribution'
import { Organizations } from '../views/provider/Organizations'
import { OrgDetail } from '../views/provider/OrgDetail'
import { MCPTools } from '../views/provider/MCPTools'
import { MCPLogs } from '../views/provider/MCPLogs'
import { FileManager } from '../views/provider/FileManager'
import { Chat } from '../views/provider/Chat'
import { CompliancePanel } from '../views/provider/CompliancePanel'
import { DocumentTitle } from '../components/DocumentTitle'
import { useAuthStore } from '../stores/auth'

// 路由配置类型扩展
declare module 'react-router-dom' {
  interface RouteMeta {
    titleKey?: string
  }
}

// 顶层 Layout，用于管理文档标题
function RootLayout() {
  return (
    <>
      <DocumentTitle />
      <Outlet />
    </>
  )
}

function RequireAuth({ children }: { children: React.ReactNode }) {
  const token = useAuthStore((s) => s.token)
  if (!token) return <Navigate to="/login" replace />
  return <>{children}</>
}

function RequireGuest({ children }: { children: React.ReactNode }) {
  const token = useAuthStore((s) => s.token)
  if (token) return <Navigate to="/" replace />
  return <>{children}</>
}

function RequireRole({ role, children }: { role: string; children: React.ReactNode }) {
  const userRole = useAuthStore((s) => s.user?.role)
  if (userRole !== role) return <Navigate to="/forbidden" replace />
  return <>{children}</>
}

export const router = createBrowserRouter([
  {
    element: <RootLayout />,
    children: [
      {
        path: '/',
        element: <Home />,
        handle: { titleKey: 'home.redirecting' },
      },
      {
        path: '/login',
        element: (
          <RequireGuest>
            <Login />
          </RequireGuest>
        ),
        handle: { titleKey: 'login.title' },
      },
      {
        path: '/oauth/callback',
        element: (
          <RequireGuest>
            <Callback />
          </RequireGuest>
        ),
        handle: { titleKey: 'callback.processing' },
      },
      {
        path: '/oobe',
        element: <OOBE />,
        handle: { titleKey: 'oobe.title' },
      },
      {
        path: '/forbidden',
        element: <Forbidden />,
        handle: { titleKey: 'error.forbidden.title' },
      },
      {
        path: '/provider',
        element: (
          <RequireAuth>
            <RequireRole role="provider">
              <ProviderLayout />
            </RequireRole>
          </RequireAuth>
        ),
        handle: { titleKey: 'layout.provider' },
        children: [
          { index: true, element: <Navigate to="/provider/dashboard" replace /> },
          { path: 'dashboard', element: <Dashboard />, handle: { titleKey: 'dashboard.title' } },
          { path: 'apps', element: <Apps />, handle: { titleKey: 'apps.title' } },
          { path: 'apps/:appId', element: <AppDetail />, handle: { titleKey: 'apps.detail' } },
          { path: 'distribution', element: <AppDistribution />, handle: { titleKey: 'apps.distribution' } },
          { path: 'mcp/tools', element: <MCPTools />, handle: { titleKey: 'mcp.tools' } },
          { path: 'mcp/logs', element: <MCPLogs />, handle: { titleKey: 'mcp.logs' } },
          { path: 'files', element: <FileManager />, handle: { titleKey: 'files.title' } },
          { path: 'chat', element: <Chat />, handle: { titleKey: 'chat.title' } },
          { path: 'compliance', element: <CompliancePanel />, handle: { titleKey: 'compliance.title' } },
          { path: 'orgs', element: <Organizations />, handle: { titleKey: 'orgs.title' } },
          { path: 'orgs/:orgId', element: <OrgDetail />, handle: { titleKey: 'orgs.detail' } },
        ],
      },
      {
        path: '/user',
        element: (
          <RequireAuth>
            <UserLayout />
          </RequireAuth>
        ),
        handle: { titleKey: 'layout.user' },
        children: [
          { index: true, element: <Navigate to="/user/apps" replace /> },
          { path: 'apps', element: <Apps />, handle: { titleKey: 'apps.title' } },
          { path: 'data/:appId', element: <DataManager />, handle: { titleKey: 'data.title' } },
        ],
      },
      {
        path: '*',
        element: <NotFound />,
        handle: { titleKey: 'error.notFound.title' },
      },
    ],
  },
])
