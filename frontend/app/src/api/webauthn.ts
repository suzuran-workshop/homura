import apiClient from './client'

// WebAuthn 类型定义
export interface CredentialCreationOptions {
  challenge: string
  rp: {
    name: string
    id?: string
  }
  user: {
    id: string
    name: string
    displayName: string
  }
  pubKeyCredParams: Array<{
    type: string
    alg: number
  }>
  timeout?: number
  excludeCredentials?: Array<{
    type: string
    id: string
  }>
  authenticatorSelection?: {
    authenticatorAttachment?: 'platform' | 'cross-platform'
    requireResidentKey?: boolean
    residentKey?: 'required' | 'preferred' | 'discouraged'
    userVerification?: 'required' | 'preferred' | 'discouraged'
  }
  attestation?: 'none' | 'indirect' | 'direct' | 'enterprise'
}

export interface CredentialRequestOptions {
  challenge: string
  timeout?: number
  rpId?: string
  allowCredentials?: Array<{
    type: string
    id: string
  }>
  userVerification?: 'required' | 'preferred' | 'discouraged'
}

export interface WebAuthnRegistrationResponse {
  id: string
  rawId: string
  type: string
  response: {
    clientDataJSON: string
    attestationObject: string
  }
}

export interface WebAuthnLoginResponse {
  id: string
  rawId: string
  type: string
  response: {
    clientDataJSON: string
    authenticatorData: string
    signature: string
    userHandle?: string
  }
}

// 辅助函数：将 ArrayBuffer 转换为 Base64URL
const bufferToBase64URL = (buffer: ArrayBuffer): string => {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

// 辅助函数：将 Base64URL 转换为 ArrayBuffer
const base64URLToBuffer = (base64URL: string): ArrayBuffer => {
  const base64 = base64URL.replace(/-/g, '+').replace(/_/g, '/')
  const padding = '='.repeat((4 - base64.length % 4) % 4)
  const binary = atob(base64 + padding)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes.buffer
}

// 开始 Passkey 注册流程
export const webAuthnRegisterBegin = () =>
  apiClient.post<CredentialCreationOptions>('/oauth/webauthn/register/begin').then((r) => r.data)

// 完成 Passkey 注册
export const webAuthnRegisterComplete = (credential: WebAuthnRegistrationResponse) =>
  apiClient.post('/oauth/webauthn/register/complete', credential).then((r) => r.data)

// 开始 Passkey 登录流程
export const webAuthnLoginBegin = () =>
  apiClient.post<CredentialRequestOptions>('/oauth/webauthn/login/begin').then((r) => r.data)

// 完成 Passkey 登录
export const webAuthnLoginComplete = (credential: WebAuthnLoginResponse) =>
  apiClient.post('/oauth/webauthn/login/complete', credential).then((r) => r.data)

// 注册 Passkey（完整流程）
export const registerPasskey = async () => {
  // 1. 从后端获取注册选项
  const options = await webAuthnRegisterBegin()

  // 2. 转换 challenge
  const challenge = base64URLToBuffer(options.challenge)

  // 3. 转换 userId
  const userId = base64URLToBuffer(options.user.id)

  // 4. 调用浏览器 WebAuthn API
  const credential = await navigator.credentials.create({
    publicKey: {
      ...options,
      challenge,
      user: {
        ...options.user,
        id: userId,
      },
      pubKeyCredParams: options.pubKeyCredParams.map(p => ({
        type: 'public-key' as const,
        alg: p.alg,
      })),
      excludeCredentials: options.excludeCredentials?.map(cred => ({
        type: 'public-key' as const,
        id: base64URLToBuffer(cred.id),
      })),
    },
  }) as PublicKeyCredential | null

  if (!credential) {
    throw new Error('Passkey registration cancelled')
  }

  const response = credential.response as AuthenticatorAttestationResponse

  // 5. 转换为后端需要的格式
  const registrationResponse: WebAuthnRegistrationResponse = {
    id: credential.id,
    rawId: bufferToBase64URL(credential.rawId),
    type: credential.type,
    response: {
      clientDataJSON: bufferToBase64URL(response.clientDataJSON),
      attestationObject: bufferToBase64URL(response.attestationObject),
    },
  }

  // 6. 发送到后端完成注册
  await webAuthnRegisterComplete(registrationResponse)
}

// 登录 Passkey（完整流程）
export const loginWithPasskey = async () => {
  // 1. 从后端获取登录选项
  const options = await webAuthnLoginBegin()

  // 2. 转换 challenge
  const challenge = base64URLToBuffer(options.challenge)

  // 3. 调用浏览器 WebAuthn API
  const credential = await navigator.credentials.get({
    publicKey: {
      ...options,
      challenge,
      allowCredentials: options.allowCredentials?.map(cred => ({
        type: 'public-key' as const,
        id: base64URLToBuffer(cred.id),
      })),
    },
  }) as PublicKeyCredential | null

  if (!credential) {
    throw new Error('Passkey login cancelled')
  }

  const response = credential.response as AuthenticatorAssertionResponse

  // 5. 转换为后端需要的格式
  const loginResponse: WebAuthnLoginResponse = {
    id: credential.id,
    rawId: bufferToBase64URL(credential.rawId),
    type: credential.type,
    response: {
      clientDataJSON: bufferToBase64URL(response.clientDataJSON),
      authenticatorData: bufferToBase64URL(response.authenticatorData),
      signature: bufferToBase64URL(response.signature),
      userHandle: response.userHandle ? bufferToBase64URL(response.userHandle) : undefined,
    },
  }

  // 6. 发送到后端完成登录
  const result = await webAuthnLoginComplete(loginResponse)
  return result
}

// 检查浏览器是否支持 WebAuthn
export const isWebAuthnSupported = (): boolean => {
  return typeof window !== 'undefined' &&
    typeof window.PublicKeyCredential !== 'undefined'
}

// 检查是否支持条件式 UI（自动填充 Passkey）
export const isConditionalMediationAvailable = async (): Promise<boolean> => {
  if (typeof window === 'undefined' || typeof window.PublicKeyCredential === 'undefined') {
    return false
  }
  if (typeof (window.PublicKeyCredential as any).isConditionalMediationAvailable === 'function') {
    return await (window.PublicKeyCredential as any).isConditionalMediationAvailable()
  }
  return false
}
