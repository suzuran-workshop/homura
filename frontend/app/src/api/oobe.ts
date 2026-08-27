import apiClient from './client'

export interface OOBEStatusResponse {
  needOOBE: boolean
}

export const checkOOBEStatus = () =>
  apiClient.get<OOBEStatusResponse>('/oobe/status').then((r) => r.data)

export const completeOOBE = (data: {
  adminName: string
  adminEmail: string
  adminUsername: string
  adminPassword: string
  orgName: string
}) => apiClient.post('/oobe/setup', data).then((r) => r.data)
