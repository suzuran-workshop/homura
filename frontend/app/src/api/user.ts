import apiClient from './client'

export interface Member {
  userId: number
  phone: string
  name: string
  username: string
  email: string
  position: string
  bondId: string
  isAdmin: boolean
  isDepartmentManager: boolean
  departmentId: number | null
}

export interface MemberRequest {
  phone: string
  name: string
  username: string
  password?: string
  email: string
  position: string
  isAdmin: boolean
  departmentId: number | null
  isDepartmentManager: boolean
}

export const listMembers = (orgId: number) =>
  apiClient.get<Member[]>(`/api/provider/orgs/${orgId}/users`).then((r) => r.data)

export const createMember = (orgId: number, data: MemberRequest) =>
  apiClient.post(`/api/provider/orgs/${orgId}/users`, data).then((r) => r.data)

export const updateMember = (orgId: number, userId: number, data: Partial<MemberRequest>) =>
  apiClient.put(`/api/provider/orgs/${orgId}/users/${userId}`, data).then((r) => r.data)

export const removeMember = (orgId: number, userId: number) =>
  apiClient.delete(`/api/provider/orgs/${orgId}/users/${userId}`).then((r) => r.data)

export const resetPassword = (orgId: number, userId: number, newPassword: string) =>
  apiClient.post(`/api/provider/orgs/${orgId}/users/${userId}/reset-password`, { newPassword }).then((r) => r.data)
