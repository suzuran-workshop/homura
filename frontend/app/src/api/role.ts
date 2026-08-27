import apiClient from './client'

export interface Role {
  id: number
  orgId: number
  name: string
  description: string
  permissions: string[]
  createdAt: string
  updatedAt: string
}

export interface CreateRoleRequest {
  name: string
  description: string
  permissions: string[]
}

export interface UpdateRoleRequest {
  name?: string
  description?: string
  permissions?: string[]
}

export interface UserRole {
  userId: number
  roleId: number
  assignedAt: string
}

export const listRoles = (orgId: number) =>
  apiClient.get<Role[]>(`/api/provider/orgs/${orgId}/roles`).then((r) => r.data)

export const getRole = (orgId: number, roleId: number) =>
  apiClient.get<Role>(`/api/provider/orgs/${orgId}/roles/${roleId}`).then((r) => r.data)

export const createRole = (orgId: number, data: CreateRoleRequest) =>
  apiClient.post<Role>(`/api/provider/orgs/${orgId}/roles`, data).then((r) => r.data)

export const updateRole = (orgId: number, roleId: number, data: UpdateRoleRequest) =>
  apiClient.put<Role>(`/api/provider/orgs/${orgId}/roles/${roleId}`, data).then((r) => r.data)

export const deleteRole = (orgId: number, roleId: number) =>
  apiClient.delete(`/api/provider/orgs/${orgId}/roles/${roleId}`).then((r) => r.data)

export const listRoleUsers = (orgId: number, roleId: number) =>
  apiClient.get<UserRole[]>(`/api/provider/orgs/${orgId}/roles/${roleId}/users`).then((r) => r.data)

export const assignRoleToUser = (orgId: number, roleId: number, userId: number) =>
  apiClient.post(`/api/provider/orgs/${orgId}/roles/${roleId}/users`, { userId }).then((r) => r.data)

export const removeRoleFromUser = (orgId: number, roleId: number, userId: number) =>
  apiClient.delete(`/api/provider/orgs/${orgId}/roles/${roleId}/users/${userId}`).then((r) => r.data)

export const listUserRoles = (orgId: number, userId: number) =>
  apiClient.get<Role[]>(`/api/provider/orgs/${orgId}/users/${userId}/roles`).then((r) => r.data)
