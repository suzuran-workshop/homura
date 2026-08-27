import apiClient from './client'

export interface AdminView {
  userId: number
  name: string
  username: string
}

export interface DistributionView {
  orgId: number
  orgName: string
  admins: AdminView[]
}

export interface DistributionListResponse {
  distributions: DistributionView[]
}

export const listDistributions = (appId: number) =>
  apiClient.get<DistributionListResponse>(`/api/provider/apps/${appId}/distributions`).then((r) => r.data)

export const distributeApp = (appId: number, orgId: number) =>
  apiClient.post(`/api/provider/apps/${appId}/distributions`, { orgId }).then((r) => r.data)

export const undistributeApp = (appId: number, orgId: number) =>
  apiClient.delete(`/api/provider/apps/${appId}/distributions/${orgId}`).then((r) => r.data)

export const setAppAdmin = (appId: number, orgId: number, userId: number) =>
  apiClient.post(`/api/provider/apps/${appId}/distributions/${orgId}/admins`, { userId }).then((r) => r.data)

export const removeAppAdmin = (appId: number, orgId: number, userId: number) =>
  apiClient.delete(`/api/provider/apps/${appId}/distributions/${orgId}/admins/${userId}`).then((r) => r.data)
