import { describe, expect, it } from 'vitest'
import { dingtalkOAuth, DEFAULT_OAUTH2_DINGTALK_BASE } from './oauth.js'

describe('dingtalkOAuth 预设', () => {
  it('端点按 orgId 拼装（默认 base）', () => {
    const p = dingtalkOAuth({ orgId: 'my_org' })
    expect(p.endpoints.authorizeUrl).toBe(`${DEFAULT_OAUTH2_DINGTALK_BASE}/my_org/authorize`)
    expect(p.endpoints.tokenUrl).toBe(`${DEFAULT_OAUTH2_DINGTALK_BASE}/my_org/token`)
    expect(p.endpoints.userinfoUrl).toBe(`${DEFAULT_OAUTH2_DINGTALK_BASE}/my_org/userinfo`)
  })

  it('自定义 baseUrl + 去尾斜杠', () => {
    const p = dingtalkOAuth({ orgId: 'o', baseUrl: 'https://custom.example/' })
    expect(p.endpoints.authorizeUrl).toBe('https://custom.example/o/authorize')
  })

  it('mapUser：openId→sub, nick→nickname, avatarUrl 透传', () => {
    const p = dingtalkOAuth({ orgId: 'o' })
    expect(p.mapUser({ openId: 'op1', nick: '张三', avatarUrl: 'http://a' })).toEqual({
      sub: 'op1',
      nickname: '张三',
      avatarUrl: 'http://a',
    })
  })

  it('mapUser：缺 openId → 抛错', () => {
    const p = dingtalkOAuth({ orgId: 'o' })
    expect(() => p.mapUser({ nick: 'x' })).toThrow(/openId/)
  })

  it('mapUser：可选字段缺省不报错', () => {
    const p = dingtalkOAuth({ orgId: 'o' })
    expect(p.mapUser({ openId: 'op2' })).toEqual({ sub: 'op2', nickname: undefined, avatarUrl: undefined })
  })
})
