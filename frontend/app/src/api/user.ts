// frontend/app/src/api/user.ts
import apiClient from './client'

export interface Member {
  userId: number
  phone: string
  name: string
  username?: string
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
  password: string
  email?: string
  position?: string
  isAdmin?: boolean
  departmentId?: number | null
  isDepartmentManager?: boolean
}

export function listMembers(orgId: number) {
  return apiClient.get<Member[]>(`/api/provider/orgs/${orgId}/users`)
}

export function createMember(orgId: number, data: MemberRequest) {
  return apiClient.post<Member>(`/api/provider/orgs/${orgId}/users`, data)
}

export function updateMember(orgId: number, userId: number, data: Partial<MemberRequest>) {
  return apiClient.put<{ message: string }>(`/api/provider/orgs/${orgId}/users/${userId}`, data)
}

export function removeMember(orgId: number, userId: number) {
  return apiClient.delete<{ message: string }>(`/api/provider/orgs/${orgId}/users/${userId}`)
}

export function resetPassword(orgId: number, userId: number, newPassword: string) {
  return apiClient.post<{ message: string }>(`/api/provider/orgs/${orgId}/users/${userId}/reset-password`, {
    newPassword,
  })
}
