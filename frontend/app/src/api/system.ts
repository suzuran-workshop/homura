import apiClient from './client'

export interface SystemMetrics {
  memoryUsage: number
  memoryTotal: number
  diskUsage: number
  diskTotal: number
  cpuCores: number
  goroutines: number
  uptime: number
}

export interface DatabaseMetrics {
  maxConnections: number
  activeConnections: number
  idleConnections: number
  waitCount: number
  waitDuration: number
}

export interface LogEntry {
  timestamp: string
  level: string
  message: string
}

export const getSystemMetrics = async (): Promise<SystemMetrics> => {
  const response = await apiClient.get<SystemMetrics>('/api/system/metrics')
  return response.data
}

export const getDatabaseMetrics = async (): Promise<DatabaseMetrics> => {
  const response = await apiClient.get<DatabaseMetrics>('/api/system/database/metrics')
  return response.data
}

export const getSystemLogs = async (limit: number = 100): Promise<LogEntry[]> => {
  const response = await apiClient.get<{ logs: LogEntry[] }>(`/api/system/logs?limit=${limit}`)
  return response.data.logs || []
}
