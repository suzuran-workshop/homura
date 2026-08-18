// frontend/app/src/api/data.ts
import apiClient from './client'

export interface DataColumn {
  name: string
  type: string
  nullable?: boolean
  primaryKey?: boolean
  defaultValue?: unknown
}

export interface TableInfo {
  tableName: string
  columns: DataColumn[]
}

export interface RowListResponse {
  table: TableInfo
  rows: Record<string, unknown>[]
  count: number
  limit: number
  offset: number
}

// ---- App data management (app admins + providers) ----

export async function listTables(orgId: number, appId: string) {
  return apiClient.get<{ tables: TableInfo[] }>(`/api/data/orgs/${orgId}/apps/${appId}/tables`)
}

export async function listRows(orgId: number, appId: string, tableName: string, limit = 50, offset = 0) {
  return apiClient.get<RowListResponse>(
    `/api/data/orgs/${orgId}/apps/${appId}/tables/${tableName}/rows`,
    { params: { limit, offset } },
  )
}

export async function insertRow(orgId: number, appId: string, tableName: string, data: Record<string, unknown>) {
  return apiClient.post<{ id: number }>(`/api/data/orgs/${orgId}/apps/${appId}/tables/${tableName}/rows`, { data })
}

export async function updateRow(orgId: number, appId: string, tableName: string, rowId: number, data: Record<string, unknown>) {
  return apiClient.put<{ updated: number }>(
    `/api/data/orgs/${orgId}/apps/${appId}/tables/${tableName}/rows/${rowId}`,
    { data },
  )
}

export async function deleteRow(orgId: number, appId: string, tableName: string, rowId: number) {
  return apiClient.delete<{ deleted: number }>(`/api/data/orgs/${orgId}/apps/${appId}/tables/${tableName}/rows/${rowId}`)
}