import { describe, expect, it } from 'vitest'
import { HEALTHZ_PATH, detectRuntime, healthzPathFor } from './runtime.js'

describe('detectRuntime', () => {
  it('无任何标记时缺省 standalone', () => {
    const r = detectRuntime({})
    expect(r).toEqual({ target: 'standalone', explicit: false, reasons: [] })
  })

  it('HOMURA_RUNTIME 显式值优先于探测', () => {
    const r = detectRuntime({ HOMURA_RUNTIME: 'standalone', QWENWORK_WRITABLE_DIR: '/tmp/x' })
    expect(r.target).toBe('standalone')
    expect(r.explicit).toBe(true)
  })

  it('实测注入的标记命中 → qw-pages', () => {
    expect(detectRuntime({ QWENWORK_WRITABLE_DIR: '/tmp/qwenwork-page' }).target).toBe('qw-pages')
    expect(detectRuntime({ SUPABASE_INSTANCE_ID: 'abc' }).target).toBe('qw-pages')
  })

  it('已证伪的旧标记不再命中（平台并不注入 QW_PAGES*）', () => {
    expect(detectRuntime({ QW_PAGES: '1', QW_PAGES_APP_ID: 'x' }).target).toBe('standalone')
  })

  it('HOST/PORT 单独存在不触发 qw-pages（standalone 也常设）', () => {
    expect(detectRuntime({ HOST: '0.0.0.0', PORT: '8081' }).target).toBe('standalone')
  })

  it('空字符串标记不生效', () => {
    expect(detectRuntime({ QWENWORK_WRITABLE_DIR: '' }).target).toBe('standalone')
  })

  it('非法显式值抛错（fail fast）', () => {
    expect(() => detectRuntime({ HOMURA_RUNTIME: 'cloud' })).toThrow(/HOMURA_RUNTIME/)
  })

  it('reasons 给出命中的标记', () => {
    const r = detectRuntime({ QWENWORK_WRITABLE_DIR: '/tmp/x', SUPABASE_INSTANCE_ID: 'y' })
    expect(r.reasons).toContain('QWENWORK_WRITABLE_DIR')
    expect(r.reasons).toContain('SUPABASE_INSTANCE_ID')
  })
})

describe('healthzPathFor — 与 license guard 豁免清单同源', () => {
  it('standalone 用 /healthz', () => {
    expect(healthzPathFor('standalone')).toBe('/healthz')
  })

  it('qw-pages 让开网关保留的 /healthz', () => {
    expect(healthzPathFor('qw-pages')).toBe('/_healthz')
    expect(HEALTHZ_PATH['qw-pages']).not.toBe('/healthz')
  })
})
