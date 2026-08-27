import apiClient from './client'

export interface Application {
  id: number
  orgId: number
  name: string
  version: string
  runtime: string
  entrypoint: string
  port: number
  cpuQuota: number
  memoryQuota: number
  dbConnQuota: number
  mcpScopes: string[]
  routes: string[]
  status: string
  containerId: string
  sourceKey: string
  isAdmin: boolean
  createdAt: string
  updatedAt: string
}

export interface CreateAppRequest {
  name: string
  version: string
  runtime: string
  entrypoint: string
  port: number
  cpuQuota: number
  memoryQuota: number
  dbConnQuota: number
  mcpScopes: string[]
}

export interface Deployment {
  id: number
  applicationId: number
  version: string
  imageTag: string
  status: string
  containerId: string
  logs: string
  createdAt: string
  completedAt: string
}

export const listApps = () => apiClient.get<{apps: Application[]}>('/api/apps').then((r) => r.data.apps)

export const listAllApps = () => apiClient.get<{apps: Application[]}>('/api/provider/apps').then((r) => r.data.apps)

export const createApp = (data: CreateAppRequest) =>
  apiClient.post('/api/provider/apps', data).then((r) => r.data)

export const getApp = (id: number) =>
  apiClient.get<Application>(`/api/provider/apps/${id}`).then((r) => r.data)

export const updateApp = (id: number, data: Partial<CreateAppRequest>) =>
  apiClient.put(`/api/provider/apps/${id}`, data).then((r) => r.data)

export const deleteApp = (id: number) =>
  apiClient.delete(`/api/provider/apps/${id}`).then((r) => r.data)

export const importApp = (file: File) => {
  const form = new FormData()
  form.append('file', file)
  return apiClient.post('/api/provider/apps/import', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }).then((r) => r.data)
}

export const deployApp = (id: number) =>
  apiClient.post(`/api/provider/apps/${id}/deploy`).then((r) => r.data)

export const startApp = (id: number) =>
  apiClient.post(`/api/provider/apps/${id}/start`).then((r) => r.data)

export const stopApp = (id: number) =>
  apiClient.post(`/api/provider/apps/${id}/stop`).then((r) => r.data)

export const restartApp = (id: number) =>
  apiClient.post(`/api/provider/apps/${id}/restart`).then((r) => r.data)

export const getAppStatus = (id: number) =>
  apiClient.get(`/api/provider/apps/${id}/status`).then((r) => r.data)

export const getAppLogs = (id: number, tail = 100) =>
  apiClient.get(`/api/provider/apps/${id}/logs`, { params: { tail } }).then((r) => r.data)

export const getDeployments = (id: number) =>
  apiClient.get<Deployment[]>(`/api/provider/apps/${id}/deployments`).then((r) => r.data)
