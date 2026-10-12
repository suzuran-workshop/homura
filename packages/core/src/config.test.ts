import { describe, expect, it } from 'vitest'
import { defineConfig, parses } from './config.js'

const specs = {
  port: { env: 'PORT', default: 3000, parse: parses.int, description: '监听端口' },
  secret: { env: 'APP_SECRET', parse: parses.string, required: true, secret: true },
  debug: { env: 'DEBUG', parse: parses.boolean },
} as const

describe('defineConfig', () => {
  it('解析 env 值', () => {
    const cfg = defineConfig(specs).load({ PORT: '8080', APP_SECRET: 's' })
    expect(cfg.get('port')).toBe(8080)
    expect(cfg.get('secret')).toBe('s')
  })

  it('default 兜底', () => {
    const cfg = defineConfig(specs).load({ APP_SECRET: 's' })
    expect(cfg.get('port')).toBe(3000)
  })

  it('required 缺失抛错（含变量名）', () => {
    expect(() => defineConfig(specs).load({})).toThrow(/APP_SECRET/)
  })

  it('可选无值 → undefined', () => {
    const cfg = defineConfig(specs).load({ APP_SECRET: 's' })
    expect(cfg.get('debug')).toBeUndefined()
  })

  it('parse 失败抛错', () => {
    expect(() => defineConfig(specs).load({ APP_SECRET: 's', PORT: 'abc' })).toThrow(/integer/)
  })

  it('help() 生成 .env.example 片段：secret 打码、含注释', () => {
    const help = defineConfig(specs).help()
    expect(help).toContain('# 监听端口')
    expect(help).toContain('PORT=3000')
    expect(help).toContain('APP_SECRET=<redacted>')
    expect(help).not.toContain('DEBUG=true')
  })
})
