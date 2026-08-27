import apiClient from './client'

export interface Org {
  id: number
  name: string
  description: string
  createdAt: string
  updatedAt: string
}

export interface OrgRequest {
  name: string
  description: string
}

export const listOrgs = () => apiClient.get<Org[]>('/api/provider/orgs').then((r) => r.data)

export const createOrg = (data: OrgRequest) =>
  apiClient.post('/api/provider/orgs', data).then((r) => r.data)

export const updateOrg = (id: number, data: OrgRequest) =>
  apiClient.put(`/api/provider/orgs/${id}`, data).then((r) => r.data)

export const deleteOrg = (id: number) =>
  apiClient.delete(`/api/provider/orgs/${id}`).then((r) => r.data)
