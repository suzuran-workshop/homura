import { describe, expect, it } from 'vitest'
import { assertSchemaParity } from '@homurajs/db'
import { pgSchema } from './pg.js'
import { sqliteSchema } from './sqlite.js'

/**
 * 方言 parity 硬门禁（活文档：模板自己守这条纪律）。
 * pg ↔ sqlite 靠 assertSchemaParity 比对。
 */
describe('schema parity（pg ↔ sqlite）', () => {
  it('表名/列名/主键一致', () => {
    expect(() => assertSchemaParity(pgSchema, sqliteSchema)).not.toThrow()
  })

  it('覆盖业务表 + 第三方表（todos/refresh_tokens/license_state + auth 新表）', () => {
    const expected = [
      'licenseState', 'oidcIdentityLinks',
      'passwords', 'refreshTokens', 'todos', 'users', 'webauthnCredentials',
    ]
    expect(Object.keys(pgSchema).sort()).toEqual(expected)
    expect(Object.keys(sqliteSchema).sort()).toEqual(expected)
  })
})
