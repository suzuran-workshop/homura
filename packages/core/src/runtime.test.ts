import { describe, expect, it } from 'vitest'
import { detectRuntime } from './runtime.js'

describe('detectRuntime', () => {
  it('无任何标记时缺省 standalone', () => {
    const r = detectRuntime({})
    expect(r).toEqual({ target: 'standalone', explicit: false, reasons: [] })
  })

  it('HOMURA_RUNTIME 显式值优先于探测', () => {
    const r = detectRuntime({ HOMURA_RUNTIME: 'standalone', QW_PAGES: '1' })
    expect(r.target).toBe('standalone')
    expect(r.explicit).toBe(true)
  })

  it('QW_PAGES 标记命中 → qw-pages', () => {
    expect(detectRuntime({ QW_PAGES: '1' }).target).toBe('qw-pages')
    expect(detectRuntime({ QW_PAGES_APP_ID: 'abc' }).target).toBe('qw-pages')
  })

  it('空字符串标记不生效', () => {
    expect(detectRuntime({ QW_PAGES: '' }).target).toBe('standalone')
  })

  it('非法显式值抛错（fail fast）', () => {
    expect(() => detectRuntime({ HOMURA_RUNTIME: 'cloud' })).toThrow(/HOMURA_RUNTIME/)
  })

  it('reasons 给出命中的标记', () => {
    const r = detectRuntime({ QW_PAGES: '1', QW_PAGES_APP_ID: 'x' })
    expect(r.reasons).toContain('QW_PAGES')
    expect(r.reasons).toContain('QW_PAGES_APP_ID')
  })
})
