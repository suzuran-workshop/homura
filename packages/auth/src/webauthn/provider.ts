/**
 * WebAuthn Provider —— 封装 @simplewebauthn/server 的注册/认证 ceremony。
 *
 * @simplewebauthn/server 是 optional peer dep，通过动态 import 加载——
 * 不用 WebAuthn 的 App 不需要安装它。
 *
 * 流程：
 * 注册：generateRegistrationOptions → 客户端 attestation → verifyRegistrationResponse → store credential
 * 认证：generateAuthenticationOptions → 客户端 assertion → verifyAuthenticationResponse → 更新 counter
 *
 * challenge 存储复用 core 的 TtlKv（与 OAuth2 state 同一机制）。
 */
import { randomToken } from '@homurajs/core'
import type { TtlKv } from '@homurajs/core'
import type { LocalUser, UserStore } from '../identity/types.js'
import type { WebauthnCredentialStore } from './credential-store.js'

/** WebAuthn transport 类型（从 @simplewebauthn/types 提取） */
type AuthenticatorTransportFuture =
  | 'ble'
  | 'cable'
  | 'hybrid'
  | 'internal'
  | 'nfc'
  | 'smart-card'
  | 'usb'

/**
 * WebAuthn RP 配置。
 * rpId 通常是域名（如 'app.example.com'），origin 是完整 origin（如 'https://app.example.com'）。
 */
export interface WebAuthProviderConfig {
  rpId: string
  rpName: string
  /** 允许的 origin（如 ['https://app.example.com']） */
  origin: string | string[]
  credentialStore: WebauthnCredentialStore
  userStore: UserStore
  /** challenge 存储（TtlKv），TTL 5min */
  challengeKv: TtlKv
  /** challenge TTL（默认 5min） */
  challengeTtlMs?: number
  now?: () => number
}

const DEFAULT_CHALLENGE_TTL = 5 * 60_000

/** 注册 options（传给客户端 @simplewebauthn/browser 的 startRegistration） */
export interface RegistrationOptions {
  challenge: string
  rp: { name: string; id: string }
  user: { id: string; name: string; displayName: string }
  pubKeyCredParams: Array<{ type: 'public-key'; alg: number }>
  timeout: number
  attestationType: string
  authenticatorSelection: {
    userVerification: string
    residentKey: string
  }
}

/** 认证 options（传给客户端 @simplewebauthn/browser 的 startAuthentication） */
export interface AuthenticationOptions {
  challenge: string
  timeout: number
  rpId: string
  allowCredentials: Array<{ type: 'public-key'; id: string; transports?: string[] }>
  userVerification: string
}

/** 注册验证输入（客户端 attestation 响应） */
export interface RegistrationResponse {
  id: string
  rawId: string
  response: {
    clientDataJSON: string
    attestationObject: string
    transports?: string[]
  }
  type: string
  clientExtensionResults?: Record<string, unknown>
}

/** 认证验证输入（客户端 assertion 响应） */
export interface AuthenticationResponse {
  id: string
  rawId: string
  response: {
    clientDataJSON: string
    authenticatorData: string
    signature: string
    userHandle?: string | null
  }
  type: string
  clientExtensionResults?: Record<string, unknown>
}

export class WebAuthProvider {
  private readonly config: WebAuthProviderConfig
  private readonly challengeTtl: number
  private readonly nowFn: () => number

  constructor(config: WebAuthProviderConfig) {
    this.config = config
    this.challengeTtl = config.challengeTtlMs ?? DEFAULT_CHALLENGE_TTL
    this.nowFn = config.now ?? (() => Date.now())
  }

  /**
   * 生成注册 options（已登录用户发起）。
   * challenge 存入 TtlKv（key = userId:challengeType），TTL 5min。
   */
  async generateRegistrationOptions(userId: string): Promise<RegistrationOptions> {
    const { generateRegistrationOptions } = await import('@simplewebauthn/server')
    const user = await this.config.userStore.findById(userId)
    if (!user) throw new Error('user 不存在: ' + userId)
    const existingCreds = await this.config.credentialStore.findByUserId(userId)
    const options = await generateRegistrationOptions({
      rpName: this.config.rpName,
      rpID: this.config.rpId,
      userID: new TextEncoder().encode(userId),
      userName: user.username ?? user.nickname ?? user.id,
      userDisplayName: user.nickname ?? user.username ?? user.id,
      attestationType: 'none',
      excludeCredentials: existingCreds.map((c) => ({
        id: c.id,
        transports: c.transports ? (JSON.parse(c.transports) as AuthenticatorTransportFuture[]) : undefined,
      })),
      authenticatorSelection: {
        userVerification: 'preferred',
        residentKey: 'preferred',
      },
    })
    // 存 challenge
    await this.config.challengeKv.set(
      `${userId}:register`,
      options.challenge,
      this.challengeTtl,
    )
    return options as unknown as RegistrationOptions
  }

  /**
   * 验证注册响应并存储凭证。
   * challenge 一次性消费（take 语义）。
   */
  async verifyRegistration(
    userId: string,
    response: RegistrationResponse,
    displayName?: string,
  ): Promise<{ id: string }> {
    const { verifyRegistrationResponse } = await import('@simplewebauthn/server')
    const challenge = await this.config.challengeKv.take(`${userId}:register`)
    if (!challenge) throw new Error('challenge 无效或已过期')
    const verification = await verifyRegistrationResponse({
      response: response as never,
      expectedChallenge: challenge,
      expectedOrigin: this.config.origin,
      expectedRPID: this.config.rpId,
    })
    if (!verification.verified || !verification.registrationInfo) {
      throw new Error('注册验证失败')
    }
    const { credential, credentialDeviceType, credentialBackedUp } = verification.registrationInfo
    const credId = typeof credential.id === 'string'
      ? credential.id
      : Buffer.from(credential.id).toString('base64url')
    const publicKey = typeof credential.publicKey === 'string'
      ? credential.publicKey
      : Buffer.from(credential.publicKey).toString('base64url')
    await this.config.credentialStore.create({
      id: credId,
      userId,
      publicKey,
      counter: credential.counter,
      deviceType: credentialDeviceType,
      backedUp: credentialBackedUp ? 1 : 0,
      transports: response.response.transports ? JSON.stringify(response.response.transports) : null,
      displayName: displayName ?? null,
    })
    return { id: credId }
  }

  /**
   * 生成认证 options（未登录用户发起）。
   * challenge 存入 TtlKv（key = challengeId），关联 allowCredentials。
   */
  async generateAuthenticationOptions(userId?: string): Promise<AuthenticationOptions> {
    const { generateAuthenticationOptions } = await import('@simplewebauthn/server')
    let allowCredentials: Array<{ id: string; transports?: AuthenticatorTransportFuture[] }> = []
    let challengeKey: string
    if (userId) {
      const creds = await this.config.credentialStore.findByUserId(userId)
      allowCredentials = creds.map((c) => ({
        id: c.id,
        transports: c.transports ? (JSON.parse(c.transports) as AuthenticatorTransportFuture[]) : undefined,
      }))
      challengeKey = `${userId}:auth`
    } else {
      // 无 userId：允许所有凭证（客户端自选）
      challengeKey = `anon:${randomToken(16)}`
    }
    const options = await generateAuthenticationOptions({
      rpID: this.config.rpId,
      allowCredentials,
      userVerification: 'preferred',
    })
    await this.config.challengeKv.set(challengeKey, options.challenge, this.challengeTtl)
    return options as unknown as AuthenticationOptions
  }

  /**
   * 验证认证响应，返回已验证的用户（供 session 创建）。
   * challenge 一次性消费。
   */
  async verifyAuthentication(response: AuthenticationResponse): Promise<LocalUser> {
    const { verifyAuthenticationResponse } = await import('@simplewebauthn/server')
    // 按 credentialId 找凭证 → 找 user → 验 challenge
    const cred = await this.config.credentialStore.findById(response.id)
    if (!cred) throw new Error('凭证不存在: ' + response.id)
    // challenge 可能在 userId:auth 或 anon:xxx 下，都试
    let challenge = await this.config.challengeKv.take(`${cred.userId}:auth`)
    if (!challenge) {
      // 匿名 challenge 无法定位 key → 要求调用方传 challengeKey
      throw new Error('challenge 无效或已过期')
    }
    const verification = await verifyAuthenticationResponse({
      response: response as never,
      expectedChallenge: challenge,
      expectedOrigin: this.config.origin,
      expectedRPID: this.config.rpId,
      credential: {
        id: cred.id,
        publicKey: Buffer.from(cred.publicKey, 'base64url'),
        counter: cred.counter,
        transports: cred.transports ? (JSON.parse(cred.transports) as AuthenticatorTransportFuture[]) : undefined,
      },
    })
    if (!verification.verified) throw new Error('认证验证失败')
    // 更新 counter（防重放）
    await this.config.credentialStore.updateCounter(cred.id, verification.authenticationInfo.newCounter)
    const user = await this.config.userStore.findById(cred.userId)
    if (!user) throw new Error('user 不存在: ' + cred.userId)
    return user
  }

  /** 列出用户的所有凭证（管理用） */
  async listCredentials(userId: string) {
    return this.config.credentialStore.findByUserId(userId)
  }

  /** 删除凭证 */
  async deleteCredential(userId: string, credentialId: string): Promise<void> {
    const cred = await this.config.credentialStore.findById(credentialId)
    if (!cred) throw new Error('凭证不存在')
    if (cred.userId !== userId) throw new Error('凭证不属于该用户')
    await this.config.credentialStore.delete(credentialId)
  }
}
