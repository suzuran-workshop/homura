import { afterEach, describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  INSECURE_SESSION_SECRET,
  assertSecretsOverridden,
  loadConfig,
  resolveDialect,
} from './env.js'

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

/** qw-pages 实测注入的标记之一 */
const QW_PAGES_ENV = { QWENWORK_WRITABLE_DIR: '/tmp/qwenwork-page' }
const SAFE_SECRET = 'a-real-secret-that-is-long-enough-32b!'

describe('resolveDialect — 显式优先，缺省按形态', () => {
  it('显式 DIALECT 覆盖形态缺省', () => {
    expect(resolveDialect(loadConfig({ DIALECT: 'pg' }, { configFile: false }), QW_PAGES_ENV)).toBe(
      'pg',
    )
    expect(
      resolveDialect(loadConfig({ DIALECT: 'sqlite' }, { configFile: false }), QW_PAGES_ENV),
    ).toBe('sqlite')
  })

  it('未显式设置：standalone → sqlite，qw-pages → rest', () => {
    expect(resolveDialect(loadConfig({}, { configFile: false }), {})).toBe('sqlite')
    expect(resolveDialect(loadConfig({}, { configFile: false }), QW_PAGES_ENV)).toBe('rest')
  })
})

describe('assertSecretsOverridden — 公开缺省密钥不得上生产', () => {
  // 断言只在「真的会签 session」时生效，故这些用例都要启用 auth
  const AUTH = { OAUTH_DINGTALK_ORG_ID: 'org' }

  it('qw-pages + 启用 auth + 缺省 SESSION_SECRET → loadConfig 启动期即拒绝', () => {
    expect(() => loadConfig({ ...QW_PAGES_ENV, ...AUTH }, { configFile: false })).toThrow(
      /SESSION_SECRET/,
    )
    expect(() => loadConfig({ ...QW_PAGES_ENV, ...AUTH }, { configFile: false })).toThrow(
      /伪造会话/,
    )
  })

  it('单独调用断言函数同样生效（config 由非生产 env 构造，再换 env 判定）', () => {
    const config = loadConfig({ ...AUTH }, { configFile: false })
    expect(() => assertSecretsOverridden(config, QW_PAGES_ENV)).toThrow(/SESSION_SECRET/)
  })

  it('NODE_ENV=production + 启用 auth + 缺省密钥 → 拒绝启动', () => {
    const config = loadConfig({ ...AUTH }, { configFile: false })
    expect(() => assertSecretsOverridden(config, { NODE_ENV: 'production' })).toThrow(
      /SESSION_SECRET/,
    )
  })

  it('未启用 auth 时放行：不签 JWT 就不该被缺省密钥挡住（回归）', () => {
    // 冷启动验收发现的 bug：断言曾无条件执行，导致 Pages 上纯匿名 App 也无法启动
    expect(() => loadConfig({ ...QW_PAGES_ENV }, { configFile: false })).not.toThrow()
    const config = loadConfig({}, { configFile: false })
    expect(() => assertSecretsOverridden(config, QW_PAGES_ENV)).not.toThrow()
  })

  it('qw-pages + 启用 auth + 已覆盖密钥 → 通过', () => {
    const env = { ...QW_PAGES_ENV, ...AUTH, SESSION_SECRET: SAFE_SECRET }
    expect(() => loadConfig(env, { configFile: false })).not.toThrow()
  })

  it('standalone 开发态 + 缺省密钥 → 放行（不挡本地开发）', () => {
    expect(() => loadConfig({ ...AUTH }, { configFile: false })).not.toThrow()
  })

  it('缺省值常量与 configSpecs 里的实际默认一致（防止改了默认却漏改断言）', () => {
    const config = loadConfig({}, { configFile: false })
    expect(config.get('sessionSecret')).toBe(INSECURE_SESSION_SECRET)
  })
})

describe('loadConfig — 部署期配置文件', () => {
  it('从文件读到值（Pages 上密钥唯一的投递通道）', () => {
    const path = tmpFile(
      'homura.config.env',
      `SESSION_SECRET=${SAFE_SECRET}\nOAUTH_CLIENT_SECRET=ocs\n`,
    )
    const config = loadConfig({ ...QW_PAGES_ENV }, { configFile: path })
    expect(config.get('sessionSecret')).toBe(SAFE_SECRET)
    expect(config.get('oauthClientSecret')).toBe('ocs')
    // 有了真实密钥，启动期断言就该放行
    expect(() => assertSecretsOverridden(config, QW_PAGES_ENV)).not.toThrow()
  })

  it('真实 env 优先于文件', () => {
    const path = tmpFile('homura.config.env', 'DIALECT=rest\n')
    const config = loadConfig({ DIALECT: 'pg' }, { configFile: path })
    expect(config.get('dialect')).toBe('pg')
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
