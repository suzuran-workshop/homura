import { describe, expect, it } from 'vitest'
import { dingtalkOidc, DEFAULT_OIDC_DINGTALK_BASE } from './oauth.js'

describe('dingtalkOidc 预设', () => {
  it('端点与 issuer 按 orgId 拼装（默认 base）', () => {
    const p = dingtalkOidc({ orgId: 'my_org' })
    expect(p.issuer).toBe(`${DEFAULT_OIDC_DINGTALK_BASE}/my_org`)
    expect(p.endpoints.authorizeUrl).toBe(`${DEFAULT_OIDC_DINGTALK_BASE}/my_org/authorize`)
    expect(p.endpoints.tokenUrl).toBe(`${DEFAULT_OIDC_DINGTALK_BASE}/my_org/token`)
    expect(p.endpoints.userinfoUrl).toBe(`${DEFAULT_OIDC_DINGTALK_BASE}/my_org/userinfo`)
  })

  it('自定义 baseUrl + 去尾斜杠', () => {
    const p = dingtalkOidc({ orgId: 'o', baseUrl: 'https://custom.example/' })
    expect(p.issuer).toBe('https://custom.example/o')
    expect(p.endpoints.authorizeUrl).toBe('https://custom.example/o/authorize')
  })

  it('mapUser：标准 OIDC {sub,name,picture}（实读 oidc-dingtalk 源码核对）', () => {
    const p = dingtalkOidc({ orgId: 'o' })
    expect(
      p.mapUser({ sub: 'op1', name: '张三', email: 'op1@dingtalk.internal', picture: 'http://a' }),
    ).toEqual({ sub: 'op1', nickname: '张三', avatarUrl: 'http://a' })
  })

  it('mapUser：缺 sub → 抛错', () => {
    const p = dingtalkOidc({ orgId: 'o' })
    expect(() => p.mapUser({ name: 'x' })).toThrow(/sub/)
  })

  it('mapUser：picture 空串归一为 undefined', () => {
    const p = dingtalkOidc({ orgId: 'o' })
    expect(p.mapUser({ sub: 'op2', name: '李四', picture: '' })).toEqual({
      sub: 'op2',
      nickname: '李四',
      avatarUrl: undefined,
    })
  })

  it('mapUser：可选字段缺省不报错', () => {
    const p = dingtalkOidc({ orgId: 'o' })
    expect(p.mapUser({ sub: 'op3' })).toEqual({ sub: 'op3', nickname: undefined, avatarUrl: undefined })
  })
})
