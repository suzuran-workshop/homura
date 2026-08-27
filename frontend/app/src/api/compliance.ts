import apiClient from './client'

export interface ComplianceCheck {
  id: string
  category: string
  name: string
  description: string
  status: 'pass' | 'fail' | 'warning' | 'pending'
  severity: 'high' | 'medium' | 'low'
  lastChecked: string
  details?: string
}

export interface ComplianceReport {
  id: string
  title: string
  generatedAt: string
  overallScore: number
  totalChecks: number
  passedChecks: number
  failedChecks: number
  warningChecks: number
  checks: ComplianceCheck[]
}

export interface ComplianceSummary {
  overallScore: number
  totalChecks: number
  passedChecks: number
  failedChecks: number
  warningChecks: number
  lastReportId?: string
  lastGeneratedAt?: string
}

export const complianceApi = {
  // 获取合规摘要
  getSummary: (): Promise<ComplianceSummary> => {
    return apiClient.get('/api/compliance/summary').then(res => res.data)
  },

  // 获取最新报告
  getLatestReport: (): Promise<ComplianceReport> => {
    return apiClient.get('/api/compliance/reports/latest').then(res => res.data)
  },

  // 获取报告列表
  getReports: (): Promise<ComplianceReport[]> => {
    return apiClient.get('/api/compliance/reports').then(res => res.data)
  },

  // 获取单个报告
  getReport: (reportId: string): Promise<ComplianceReport> => {
    return apiClient.get(`/api/compliance/reports/${reportId}`).then(res => res.data)
  },

  // 生成新报告
  generateReport: (): Promise<ComplianceReport> => {
    return apiClient.post('/api/compliance/reports/generate').then(res => res.data)
  },

  // 导出报告
  exportReport: (reportId: string, format: 'pdf' | 'json' = 'pdf'): Promise<Blob> => {
    return apiClient.get(`/api/compliance/reports/${reportId}/export`, {
      params: { format },
      responseType: 'blob',
    }).then(res => res.data)
  },
}
