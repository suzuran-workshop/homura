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

/**
 * 时序均衡用的假哈希（懒生成 + 缓存）。
 *
 * 为什么需要：verify 在「用户不存在 / 无密码记录」时若直接返回 null，就跳过了
 * ~50-100ms 的 scrypt 运算，而用户存在时会跑——响应时间差可被用来枚举有效用户名
 * （即便响应体已统一）。故对不存在的用户也拿这个假哈希跑一遍 verifyPassword 再丢弃，
 * 把两条路径的耗时拉平。首次调用付一次生成成本，之后复用缓存。
 */
let dummyHashCache: string | undefined
function dummyHash(): string {
  if (dummyHashCache === undefined) {
    dummyHashCache = hashPassword('timing-equalization-dummy-password')
  }
  return dummyHashCache
}

export interface PasswordProviderOptions {
  userStore: UserStore
  passwordStore: PasswordStore
}

/**
 * 用户名已被占用。register 预检 username 时抛出（跨方言确定的类型化错误），
 * 路由层据此回 409；唯一索引是并发兜底（见 hono/password-routes.ts 的 isUniqueViolation）。
 */
export class UsernameTakenError extends Error {
  constructor(public readonly username: string) {
    super(`用户名已被注册: ${username}`)
    this.name = 'UsernameTakenError'
  }
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
   *
   * username 占用走**两道防线**：
   *  1. 预检 findByUsername → 抛类型化 UsernameTakenError（跨方言确定，路由回 409 的主路径）；
   *  2. users.username 唯一索引兜底并发（两个请求同时过预检时，create 撞唯一约束，
   *     路由层 isUniqueViolation 识别后同样回 409）。
   *
   * ⚠ 两步非原子（store 抽象不暴露事务）：先建 user 再建 password，若 password 创建失败，
   *   会留下一个无密码、username 已被占用的孤儿 user（既登不进又报废了用户名）。
   *   故 password 创建失败时 best-effort 删除刚建的 user 再抛原错误，把窗口收窄到
   *   「user 删除也失败」这种双重故障（此时日志可见，运维可手动清理）。
   */
  async register(input: { username: string; password: string; nickname?: string }): Promise<LocalUser> {
    // 防线 1：预检 username 占用（干净的类型化错误，不依赖解析 DB 方言错误文本）
    if (await this.userStore.findByUsername(input.username)) {
      throw new UsernameTakenError(input.username)
    }
    const user = await this.userStore.create({ username: input.username, nickname: input.nickname })
    const passwordHash = hashPassword(input.password)
    try {
      await this.passwordStore.create({ userId: user.id, passwordHash })
    } catch (e) {
      // 清理孤儿 user，避免 username 被永久占用；清理失败不掩盖原始错误
      try {
        await this.userStore.delete(user.id)
      } catch {
        // 双重故障：user 也删不掉。原始错误更重要，吞掉清理异常。
      }
      throw e
    }
    return user
  }

  /**
   * 验证用户名密码，返回用户（供 session 创建）。
   * 用户不存在或密码错误均返回 null（响应不区分，且耗时均衡，防枚举攻击）。
   */
  async verify(username: string, password: string): Promise<LocalUser | null> {
    const user = await this.userStore.findByUsername(username)
    if (!user) {
      // 跑一次假哈希再丢弃：与「用户存在」路径耗时对齐，堵时序枚举
      verifyPassword(password, dummyHash())
      return null
    }
    const record = await this.passwordStore.findByUserId(user.id)
    if (!record) {
      verifyPassword(password, dummyHash())
      return null
    }
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
