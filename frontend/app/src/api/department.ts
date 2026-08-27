import apiClient from './client'

export interface Department {
  id: number
  orgId: number
  name: string
  parentId: number | null
  level: number
  managerUserId: number | null
  description: string
  createdAt: string
  updatedAt: string
}

export interface DepartmentNode extends Department {
  children: DepartmentNode[]
}

export interface DepartmentRequest {
  name: string
  parentId: number | null
  description: string
}

export const listDepartments = (orgId: number) =>
  apiClient.get<Department[]>(`/api/provider/orgs/${orgId}/departments`).then((r) => r.data)

export const getDepartmentTree = (orgId: number) =>
  apiClient.get<DepartmentNode[]>(`/api/provider/orgs/${orgId}/departments/tree`).then((r) => r.data)

export const createDepartment = (orgId: number, data: DepartmentRequest) =>
  apiClient.post(`/api/provider/orgs/${orgId}/departments`, data).then((r) => r.data)

export const updateDepartment = (orgId: number, deptId: number, data: DepartmentRequest) =>
  apiClient.put(`/api/provider/orgs/${orgId}/departments/${deptId}`, data).then((r) => r.data)

export const deleteDepartment = (orgId: number, deptId: number) =>
  apiClient.delete(`/api/provider/orgs/${orgId}/departments/${deptId}`).then((r) => r.data)

export const setDepartmentManager = (orgId: number, deptId: number, managerUserId: number | null) =>
  apiClient.post(`/api/provider/orgs/${orgId}/departments/${deptId}/manager`, { managerUserId }).then((r) => r.data)
