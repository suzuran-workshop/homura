/**
 * 密码认证 Provider —— 基于 scrypt 的密码哈希 + 验证。
 *
 * 职责：
 * - register: 创建用户 + 密码记录
 * - verify: 验证用户名密码，返回用户（供 session 创建）
 * - changePassword: 修改密码（需验证旧密码）
 * - deletePassword: 删除密码记录
 *
 * ⚠ scrypt 参数（N=16384, r=8, p=1）适合 2024 年硬件，未来可升级。
 * ⚠ 密码哈希格式：$scrypt$N,r,p$salt$hash（便于未来升级算法）。
 * ⚠ 通过 PasswordStore 接口操作数据库，不直接依赖 DrizzleDb。
 */
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import type { LocalUser, UserStore } from '../identity/types.js'
import type { PasswordStore } from './store.js'

const SCRYPT_N = 16384
const SCRYPT_R = 8
const SCRYPT_P = 1
const SALT_BYTES = 16
const HASH_BYTES = 64
const SCRYPT_OPTIONS = { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P } as const

/** 生成密码哈希（scrypt）。格式：$scrypt$N,r,p$salt$hash */
function hashPassword(password: string): string {
  const salt = randomBytes(SALT_BYTES)
  const hash = scryptSync(password, salt, HASH_BYTES, SCRYPT_OPTIONS)
  return `$scrypt$${SCRYPT_N},${SCRYPT_R},${SCRYPT_P}$${salt.toString('base64')}$${hash.toString('base64')}`
}

/** 验证密码（timing-safe 比较） */
function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split('$')
  if (parts.length !== 5 || parts[1] !== 'scrypt') return false
  const params = parts[2]
  if (!params) return false
  const saltB64 = parts[3]
  const hashB64 = parts[4]
  if (!saltB64 || !hashB64) return false
  const [nStr, rStr, pStr] = params.split(',')
  const N = Number(nStr)
  const r = Number(rStr)
  const p = Number(pStr)
  if (!N || !r || !p) return false
  const salt = Buffer.from(saltB64, 'base64')
  const expected = Buffer.from(hashB64, 'base64')
  const actual = scryptSync(password, salt, HASH_BYTES, { N, r, p })
  return timingSafeEqual(actual, expected)
}

export interface PasswordProviderOptions {
  userStore: UserStore
  passwordStore: PasswordStore
}

/**
 * 密码认证 Provider。
 * 依赖 UserStore（用户 CRUD）+ PasswordStore（密码 CRUD），不直接依赖数据库实例。
 */
export class PasswordProvider {
  private readonly userStore: UserStore
  private readonly passwordStore: PasswordStore

  constructor(opts: PasswordProviderOptions) {
    this.userStore = opts.userStore
    this.passwordStore = opts.passwordStore
  }

  /**
   * 注册用户：创建 user + password 记录。
   * username 重复抛错（唯一约束冲突透传）。
   */
  async register(input: { username: string; password: string; nickname?: string }): Promise<LocalUser> {
    const user = await this.userStore.create({ username: input.username, nickname: input.nickname })
    const passwordHash = hashPassword(input.password)
    await this.passwordStore.create({ userId: user.id, passwordHash })
    return user
  }

  /**
   * 验证用户名密码，返回用户（供 session 创建）。
   * 用户不存在或密码错误均返回 null（不区分，防枚举攻击）。
   */
  async verify(username: string, password: string): Promise<LocalUser | null> {
    const user = await this.userStore.findByUsername(username)
    if (!user) return null
    const record = await this.passwordStore.findByUserId(user.id)
    if (!record) return null
    const valid = verifyPassword(password, record.passwordHash)
    return valid ? user : null
  }

  /**
   * 修改密码（需验证旧密码）。
   * 旧密码错误抛错；无密码记录抛错。
   */
  async changePassword(userId: string, oldPassword: string, newPassword: string): Promise<void> {
    const record = await this.passwordStore.findByUserId(userId)
    if (!record) throw new Error('密码记录不存在')
    const valid = verifyPassword(oldPassword, record.passwordHash)
    if (!valid) throw new Error('旧密码错误')
    const newHash = hashPassword(newPassword)
    await this.passwordStore.updateHash(userId, newHash)
  }

  /** 删除密码记录（用户将无法用密码登录） */
  async deletePassword(userId: string): Promise<void> {
    await this.passwordStore.delete(userId)
  }
}
