import { afterEach, describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { INSECURE_SESSION_SECRET, assertSecretsOverridden, loadConfig } from './env.js'

const dirs: string[] = []
function tmpFile(name: string, text: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'homura-env-'))
  dirs.push(dir)
  const p = join(dir, name)
  writeFileSync(p, text)
  return p
}
afterEach(() => {
  while (dirs.length > 0) {
    const d = dirs.pop()
    if (d) rmSync(d, { recursive: true, force: true })
  }
})

const SAFE_SECRET = 'a-real-secret-that-is-long-enough-32b!'

describe('dialect — 显式优先，缺省 sqlite', () => {
  it('显式 DIALECT=pg / sqlite', () => {
    expect(loadConfig({ DIALECT: 'pg' }, { configFile: false }).get('dialect')).toBe('pg')
    expect(loadConfig({ DIALECT: 'sqlite' }, { configFile: false }).get('dialect')).toBe('sqlite')
  })

  it('未显式设置 → sqlite', () => {
    expect(loadConfig({}, { configFile: false }).get('dialect')).toBe('sqlite')
  })

  it('未知值回落 sqlite', () => {
    expect(loadConfig({ DIALECT: 'nonsense' }, { configFile: false }).get('dialect')).toBe('sqlite')
  })
})

describe('assertSecretsOverridden — 公开缺省密钥不得上生产', () => {
  // 断言只在「真的会签 session」时生效，故这些用例都要启用某种认证
  const AUTH = { OAUTH_DINGTALK_ORG_ID: 'org' }

  it('NODE_ENV=production + 启用 auth + 缺省 SESSION_SECRET → loadConfig 启动期即拒绝', () => {
    expect(() => loadConfig({ ...AUTH, NODE_ENV: 'production' }, { configFile: false })).toThrow(
      /SESSION_SECRET/,
    )
    expect(() => loadConfig({ ...AUTH, NODE_ENV: 'production' }, { configFile: false })).toThrow(
      /伪造会话/,
    )
  })

  it('单独调用断言函数同样生效（config 由非生产 env 构造，再换 env 判定）', () => {
    const config = loadConfig({ ...AUTH }, { configFile: false })
    expect(() => assertSecretsOverridden(config, { NODE_ENV: 'production' })).toThrow(/SESSION_SECRET/)
  })

  // 回归：闸门曾只看 oauthOrgId，纯密码认证（缺省即开）带公开缺省密钥可静默上生产 → 会话可伪造。
  it('纯密码认证（无 OIDC）+ 缺省密钥 + 生产 → 同样拒绝启动（回归 #3）', () => {
    const config = loadConfig({ AUTH_PASSWORD_ENABLED: 'true' }, { configFile: false })
    expect(config.get('oauthOrgId')).toBeUndefined()
    expect(() => assertSecretsOverridden(config, { NODE_ENV: 'production' })).toThrow(/SESSION_SECRET/)
    expect(() => assertSecretsOverridden(config, { NODE_ENV: 'production' })).toThrow(/伪造会话/)
  })

  it('WebAuthn 启用（无 OIDC / 无密码）+ 缺省密钥 + 生产 → 拒绝启动', () => {
    const config = loadConfig(
      { AUTH_PASSWORD_ENABLED: 'false', AUTH_WEBAUTHN_ENABLED: 'true' },
      { configFile: false },
    )
    expect(() => assertSecretsOverridden(config, { NODE_ENV: 'production' })).toThrow(/SESSION_SECRET/)
  })

  it('三类认证全关时放行：不签 JWT 就不该被缺省密钥挡住（回归）', () => {
    // 三类认证均 opt-in（密码/WebAuthn 缺省关，OIDC 靠 oauthOrgId）→ 空配置即纯匿名。
    const config = loadConfig({}, { configFile: false })
    // 锁定 opt-in 缺省：密码/WebAuthn 缺省关（"配了啥才启用啥"）
    expect(config.get('authPasswordEnabled')).toBe(false)
    expect(config.get('authWebauthnEnabled')).toBe(false)
    expect(() => assertSecretsOverridden(config, { NODE_ENV: 'production' })).not.toThrow()
  })

  it('生产 + 启用 auth + 已覆盖密钥 → 通过', () => {
    const env = { ...AUTH, NODE_ENV: 'production', SESSION_SECRET: SAFE_SECRET }
    expect(() => loadConfig(env, { configFile: false })).not.toThrow()
  })

  it('开发态 + 缺省密钥 → 放行（不挡本地开发）', () => {
    expect(() => loadConfig({ ...AUTH }, { configFile: false })).not.toThrow()
  })

  it('缺省值常量与 configSpecs 里的实际默认一致（防止改了默认却漏改断言）', () => {
    const config = loadConfig({}, { configFile: false })
    expect(config.get('sessionSecret')).toBe(INSECURE_SESSION_SECRET)
  })
})

describe('loadConfig — 部署期配置文件', () => {
  it('从文件读到值（密钥的投递通道之一）', () => {
    const path = tmpFile(
      'homura.config.env',
      `SESSION_SECRET=${SAFE_SECRET}\nOAUTH_CLIENT_SECRET=ocs\n`,
    )
    const config = loadConfig({ NODE_ENV: 'production' }, { configFile: path })
    expect(config.get('sessionSecret')).toBe(SAFE_SECRET)
    expect(config.get('oauthClientSecret')).toBe('ocs')
    // 有了真实密钥，启动期断言就该放行
    expect(() => assertSecretsOverridden(config, { NODE_ENV: 'production' })).not.toThrow()
  })

  it('真实 env 优先于文件', () => {
    const path = tmpFile('homura.config.env', 'DIALECT=pg\n')
    const config = loadConfig({ DIALECT: 'sqlite' }, { configFile: path })
    expect(config.get('dialect')).toBe('sqlite')
  })

  it('configFile:false 时完全不读文件（e2e 注入桩配置用）', () => {
    const config = loadConfig({ DIALECT: 'sqlite' }, { configFile: false })
    expect(config.get('dialect')).toBe('sqlite')
  })

  it('配置文件写错 → 启动期抛错，不静默忽略', () => {
    const path = tmpFile('homura.config.env', 'SESSION_SECRET=x\n这行不是配置\n')
    expect(() => loadConfig({}, { configFile: path })).toThrow(/第 2 行/)
  })
})
