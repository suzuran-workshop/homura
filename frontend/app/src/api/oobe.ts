// frontend/app/src/api/oobe.ts
import apiClient from './client'

export interface OOBEStatusResponse {
  needOOBE: boolean
}

export async function checkOOBEStatus() {
  return apiClient.get<OOBEStatusResponse>('/oobe/status')
}
