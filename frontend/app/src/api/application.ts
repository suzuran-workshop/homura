// frontend/app/src/api/application.ts
// Application management API client.
import apiClient from './client'

export interface Application {
  id: string
  orgId: number
  name: string
  version: string
  runtime: string
  entrypoint: string
  port: number
  cpuQuota: string
  memoryQuota: string
  dbConnQuota: number
  mcpScopes?: string[]
  routes?: Record<string, unknown>
  status: string // created, running, stopped, error, deleted
  containerId?: string
  isAdmin?: boolean // caller is an app admin for this (org, app)
  createdAt: string
  updatedAt: string
}

export interface CreateAppRequest {
  name: string
  version: string
  runtime: string
  entrypoint: string
  port: number
  cpuQuota: string
  memoryQuota: string
  dbConnQuota: number
  mcpScopes: string[]
}

// ---- Generic (all roles) ----

// List apps for the caller's org (OA start page).
export function listApps() {
  return apiClient.get<{ apps: Application[] }>('/api/apps')
}

// ---- Provider-only management ----

export function listAllApps() {
  return apiClient.get<{ apps: Application[] }>('/api/provider/apps')
}

export function createApp(data: CreateAppRequest) {
  return apiClient.post<Application>('/api/provider/apps', data)
}

export function getApp(id: string) {
  return apiClient.get<Application>(`/api/provider/apps/${id}`)
}

export function updateApp(id: string, data: Partial<CreateAppRequest>) {
  return apiClient.put<Application>(`/api/provider/apps/${id}`, data)
}

export function deleteApp(id: string) {
  return apiClient.delete(`/api/provider/apps/${id}`)
}

export function deployApp(id: string) {
  return apiClient.post(`/api/provider/apps/${id}/deploy`)
}

export function startApp(id: string) {
  return apiClient.post(`/api/provider/apps/${id}/start`)
}

export function stopApp(id: string) {
  return apiClient.post(`/api/provider/apps/${id}/stop`)
}

export function restartApp(id: string) {
  return apiClient.post(`/api/provider/apps/${id}/restart`)
}

export function getAppStatus(id: string) {
  return apiClient.get<{ status: string }>(`/api/provider/apps/${id}/status`)
}

export function getAppLogs(id: string, tail = 100) {
  return apiClient.get<{ logs: string }>(`/api/provider/apps/${id}/logs`, {
    params: { tail },
  })
}

export interface Deployment {
  id: string
  applicationId: string
  version: string
  imageTag: string
  status: string // building, deployed, failed, stopped
  containerId: string
  logs: string
  createdAt: string
  completedAt: string | null
}

export function getDeployments(id: string) {
  return apiClient.get<{ deployments: Deployment[] }>(`/api/provider/apps/${id}/deployments`)
}
