import type { AuthUser } from '../types.js'
import type { RefreshTokenStore } from './store.js'

export interface SessionManagerConfig {
  /** HS256 密钥（>=32 bytes，启动校验） */
  secret: string
  accessTokenTtlSec: number
  refreshTokenTtlSec: number
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

/**
 * 自管 session：短 JWT（HS256）+ opaque refresh（rotate + familyId 复用检测整族吊销）。
 * 上游（oauth2-dingtalk）不支持 refresh token，生命周期完全自管。
 */
export class SessionManager {
  constructor(_config: SessionManagerConfig, _store: RefreshTokenStore) {}

  async createSession(_user: AuthUser): Promise<SessionTokens> {
    throw new Error('NotImplemented: SessionManager.createSession')
  }

  async verifyAccessToken(_token: string): Promise<SessionClaims | null> {
    throw new Error('NotImplemented: SessionManager.verifyAccessToken')
  }

  /** rotate：旧 token 一次性消费；复用检出（同 family 二次使用）→ 吊销整族 */
  async refresh(_refreshToken: string): Promise<SessionTokens | null> {
    throw new Error('NotImplemented: SessionManager.refresh')
  }

  async revokeSession(_sid: string): Promise<void> {
    throw new Error('NotImplemented: SessionManager.revokeSession')
  }

  async revokeUser(_sub: string): Promise<void> {
    throw new Error('NotImplemented: SessionManager.revokeUser')
  }
}
