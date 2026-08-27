import apiClient from './client'

export interface MCPTool {
  name: string
  description: string
  inputSchema: any
}

export interface AuditLogEntry {
  id: number
  orgId: number
  userId: number
  action: string
  resourceType: string
  resourceId: string
  ipAddress: string
  userAgent: string
  requestData: any
  responseStatus: number
  createdAt: string
}

export const listMCPTools = () =>
  apiClient.get('/mcp/tools').then((r) => {
    const data = r.data
    return data.result?.tools || data.tools || []
  })

export const listAuditLogs = (params?: { orgId?: number; action?: string; limit?: number }) =>
  apiClient.get<AuditLogEntry[]>('/api/provider/audit/logs', { params }).then((r) => r.data)
