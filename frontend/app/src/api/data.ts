import apiClient from './client'

export interface TableColumn {
  name: string
  type: string
  nullable: boolean
  primaryKey: boolean
  defaultValue: string | null
}

export interface TableInfo {
  tableName: string
  columns: TableColumn[]
}

export interface RowListResponse {
  table: string
  rows: Record<string, any>[]
  count: number
  limit: number
  offset: number
}

export const listTables = (orgId: number, appId: number) =>
  apiClient.get<TableInfo[]>(`/api/data/orgs/${orgId}/apps/${appId}/tables`).then((r) => r.data)

export const listRows = (orgId: number, appId: number, tableName: string, limit = 50, offset = 0) =>
  apiClient.get<RowListResponse>(`/api/data/orgs/${orgId}/apps/${appId}/tables/${tableName}/rows`, {
    params: { limit, offset },
  }).then((r) => r.data)

export const insertRow = (orgId: number, appId: number, tableName: string, data: Record<string, any>) =>
  apiClient.post(`/api/data/orgs/${orgId}/apps/${appId}/tables/${tableName}/rows`, data).then((r) => r.data)

export const updateRow = (orgId: number, appId: number, tableName: string, rowId: number, data: Record<string, any>) =>
  apiClient.put(`/api/data/orgs/${orgId}/apps/${appId}/tables/${tableName}/rows/${rowId}`, data).then((r) => r.data)

export const deleteRow = (orgId: number, appId: number, tableName: string, rowId: number) =>
  apiClient.delete(`/api/data/orgs/${orgId}/apps/${appId}/tables/${tableName}/rows/${rowId}`).then((r) => r.data)
