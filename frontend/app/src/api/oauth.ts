import apiClient from './client'

export interface OrgChoice {
  orgId: number
  orgName: string
  isAdmin: boolean
}

export interface LoginResult {
  sessionId: string
  userId: number
  availableOrgs: OrgChoice[]
}

export interface SessionTokenResponse {
  access_token: string
  token_type: string
  expires_in: number
  refresh_token: string
  scope: string
}

export interface User {
  id: number
  name: string
  email: string
  role: string
  orgId: number
}

export const loginWithPassword = (username: string, password: string) =>
  apiClient.post<LoginResult>('/oauth/password/login', { username, password }).then((r) => r.data)

export const exchangeSessionToken = (sessionId: string, orgId: number) =>
  apiClient.post<SessionTokenResponse>('/oauth/session/token', { sessionId, orgId }).then((r) => r.data)

export const getDingTalkAuthorizeURL = (redirectURI: string) =>
  apiClient.get<{ url: string }>('/oauth/dingtalk/authorize', { params: { redirectURI } }).then((r) => r.data)

export const exchangeAuthorizationCode = (code: string, clientId: string, redirectURI: string, codeVerifier: string) => {
  const params = new URLSearchParams()
  params.append('grant_type', 'authorization_code')
  params.append('code', code)
  params.append('client_id', clientId)
  params.append('redirect_uri', redirectURI)
  params.append('code_verifier', codeVerifier)
  return apiClient.post<SessionTokenResponse>('/oauth/token', params, {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  }).then((r) => r.data)
}

export const refreshAccessToken = (refreshToken: string, clientId: string) => {
  const params = new URLSearchParams()
  params.append('grant_type', 'refresh_token')
  params.append('refresh_token', refreshToken)
  params.append('client_id', clientId)
  return apiClient.post<SessionTokenResponse>('/oauth/token', params, {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  }).then((r) => r.data)
}

export const revokeToken = (token: string) =>
  apiClient.post('/oauth/revoke', { token }).then((r) => r.data)

export const getMetadata = () =>
  apiClient.get('/.well-known/openid-configuration').then((r) => r.data)
