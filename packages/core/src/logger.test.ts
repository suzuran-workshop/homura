import { afterEach, describe, expect, it, vi } from 'vitest'
import { createLogger } from './logger.js'

describe('createLogger', () => {
  afterEach(() => vi.restoreAllMocks())

  it('级别过滤：debug 级以下默认不输出', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const log = createLogger()
    log.debug('hidden')
    expect(spy).not.toHaveBeenCalled()
    log.info('shown')
    expect(spy).toHaveBeenCalledOnce()
  })

  it('JSON lines 输出（结构化）', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const log = createLogger({ level: 'debug' })
    log.info('hello', { code: 42 })
    const parsed = JSON.parse(spy.mock.calls[0]![0] as string) as Record<string, unknown>
    expect(parsed['msg']).toBe('hello')
    expect(parsed['code']).toBe(42)
    expect(parsed['level']).toBe('info')
    expect(typeof parsed['ts']).toBe('string')
  })

  it('敏感字段打码（默认集合）', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const log = createLogger()
    log.info('x', { token: 'secret-value', other: 'keep' })
    const parsed = JSON.parse(spy.mock.calls[0]![0] as string) as Record<string, unknown>
    expect(parsed['token']).toBe('[REDACTED]')
    expect(parsed['other']).toBe('keep')
  })

  it('child scope 链', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const log = createLogger()
    log.child('auth').child('oauth').info('x')
    const parsed = JSON.parse(spy.mock.calls[0]![0] as string) as Record<string, unknown>
    expect(parsed['scope']).toBe('auth:oauth')
  })

  it('error 级走 console.error', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    createLogger().error('boom')
    expect(spy).toHaveBeenCalledOnce()
  })
})
