// frontend/app/src/api/distribution.ts
import apiClient from './client'

export interface AdminView {
  userId: number
  name: string
  username?: string
}

export interface DistributionView {
  orgId: number
  orgName: string
  admins: AdminView[]
}

export interface DistributionListResponse {
  distributions: DistributionView[]
}

// ---- App distribution (provider portal) ----

export async function listDistributions(appId: string) {
  return apiClient.get<DistributionListResponse>(`/api/provider/apps/${appId}/distributions`)
}

export async function distributeApp(appId: string, orgId: number) {
  return apiClient.post<{ message: string }>(`/api/provider/apps/${appId}/distributions`, { orgId })
}

export async function undistributeApp(appId: string, orgId: number) {
  return apiClient.delete<{ message: string }>(`/api/provider/apps/${appId}/distributions/${orgId}`)
}

export async function setAppAdmin(appId: string, orgId: number, userId: number) {
  return apiClient.post<{ message: string }>(`/api/provider/apps/${appId}/distributions/${orgId}/admins`, { userId })
}

export async function removeAppAdmin(appId: string, orgId: number, userId: number) {
  return apiClient.delete<{ message: string }>(`/api/provider/apps/${appId}/distributions/${orgId}/admins/${userId}`)
}