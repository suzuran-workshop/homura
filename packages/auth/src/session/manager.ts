import { createHash, randomBytes } from 'node:crypto'
import { jwtVerify, SignJWT } from 'jose'
import { randomToken } from '@homurajs/core'
import type { AuthUser } from '../types.js'
import type { RefreshTokenStore } from './store.js'

export interface SessionManagerConfig {
  /** HS256 密钥（>=32 bytes，启动校验） */
  secret: string
  accessTokenTtlSec?: number
  refreshTokenTtlSec?: number
  cookieNames?: { access?: string; refresh?: string }
  /** 时间注入口（测试 fake timers） */
  now?: () => Date
}

export interface SessionClaims {
  sub: string
  nickname?: string
  avatarUrl?: string
  sid: string
  exp: number
}

export interface SessionTokens {
  accessToken: string
  refreshToken: string
}

const DEFAULT_ACCESS_TTL = 7200 // 2h
const DEFAULT_REFRESH_TTL = 30 * 24 * 3600 // 30d
const sha256 = (s: string): string => createHash('sha256').update(s).digest('hex')

/**
 * 自管 session：短 JWT（HS256）+ opaque refresh（rotate + familyId 复用检测整族吊销）。
 * 上游（oidc-dingtalk）不签发 refresh token，生命周期完全自管。
 */
export class SessionManager {
  private readonly key: Uint8Array
  private readonly accessTtl: number
  private readonly refreshTtl: number
  private readonly cookieNames: { access: string; refresh: string }
  private readonly nowFn: () => Date

  constructor(
    private readonly config: SessionManagerConfig,
    private readonly store: RefreshTokenStore,
  ) {
    if (config.secret.length < 32) {
      throw new Error('session secret 必须 >= 32 字节（HS256 强度要求）')
    }
    this.key = new TextEncoder().encode(config.secret)
    this.accessTtl = config.accessTokenTtlSec ?? DEFAULT_ACCESS_TTL
    this.refreshTtl = config.refreshTokenTtlSec ?? DEFAULT_REFRESH_TTL
    this.cookieNames = {
      access: config.cookieNames?.access ?? 'homura_at',
      refresh: config.cookieNames?.refresh ?? 'homura_rt',
    }
    this.nowFn = config.now ?? (() => new Date())
  }

  get cookies(): { access: string; refresh: string } {
    return this.cookieNames
  }

  get accessTokenTtlSec(): number {
    return this.accessTtl
  }

  get refreshTokenTtlSec(): number {
    return this.refreshTtl
  }

  async createSession(user: AuthUser): Promise<SessionTokens> {
    // 一次登录会话 = 一个 token family：sid 与 familyId 合一，
    // 使 revokeSession(sid) 可直接走 family 维度吊销
    const sid = randomToken(16)
    const accessToken = await this.signAccess(user, sid)
    const refreshToken = await this.issueRefresh(sid, user, sid)
    return { accessToken, refreshToken }
  }

  async verifyAccessToken(token: string): Promise<SessionClaims | null> {
    try {
      const { payload } = await jwtVerify(token, this.key, {
        algorithms: ['HS256'],
        currentDate: this.nowFn(),
      })
      return payload as unknown as SessionClaims
    } catch {
      return null
    }
  }

  /**
   * rotate：旧 token 一次性消费；复用检出（同 family 二次使用）→ 吊销整族。
   * 返回 null 表示 refresh 链终态（过期/已消费/复用检出）。
   */
  async refresh(refreshToken: string): Promise<SessionTokens | null> {
    const consumed = await this.store.consume(sha256(refreshToken))
    if (!consumed) return null // 不存在或已过期
    if (consumed.revoked) {
      // 复用检出：整族吊销（盗用信号）
      await this.store.revokeFamily(consumed.familyId)
      return null
    }
    // 正常 rotate：签发新对（同 familyId 延续链条），profile 回填 access token
    const profile = consumed.profile ? (JSON.parse(consumed.profile) as { nickname?: string; avatarUrl?: string }) : {}
    const user: AuthUser = { sub: consumed.sub, ...profile }
    const accessToken = await this.signAccess(user, consumed.sid)
    const newRefresh = await this.issueRefresh(consumed.sid, user, consumed.familyId)
    return { accessToken, refreshToken: newRefresh }
  }

  async revokeSession(sid: string): Promise<void> {
    // sid === familyId（createSession 合一），直接按 family 吊销整条链
    await this.store.revokeFamily(sid)
  }

  async revokeUser(sub: string): Promise<void> {
    await this.store.revokeUser(sub)
  }

  private async signAccess(user: AuthUser, sid: string): Promise<string> {
    const now = this.nowFn()
    const exp = new Date(now.getTime() + this.accessTtl * 1000)
    const builder = new SignJWT({
      sub: user.sub,
      nickname: user.nickname,
      avatarUrl: user.avatarUrl,
      sid,
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt(now)
      // jti 保证每次签发的 access token 唯一（同秒 rotate 也不产生字节相同 token）
      .setJti(randomToken(8))
      .setExpirationTime(exp)
    return builder.sign(this.key)
  }

  private async issueRefresh(sid: string, user: AuthUser, familyId: string): Promise<string> {
    const refreshToken = randomBytes(32).toString('base64url')
    const expiresAt = this.nowFn().getTime() + this.refreshTtl * 1000
    const profile =
      user.nickname || user.avatarUrl
        ? JSON.stringify({ nickname: user.nickname, avatarUrl: user.avatarUrl })
        : null
    await this.store.create({
      tokenHash: sha256(refreshToken),
      familyId,
      sid,
      sub: user.sub,
      expiresAt,
      profile,
    })
    return refreshToken
  }
}
