import { describe, expect, it } from 'vitest'
import { assertSchemaParity } from '@homura/db'
import { pgSchema } from './pg.js'
import { sqliteSchema } from './sqlite.js'

/**
 * 双方言 parity 硬门禁（活文档：模板自己守这条纪律）。
 * 任何一侧新增/改名表或列而未同步另一侧，此测试即红。
 */
describe('schema parity（pg ↔ sqlite）', () => {
  it('表名/列名/主键一致', () => {
    expect(() => assertSchemaParity(pgSchema, sqliteSchema)).not.toThrow()
  })

  it('覆盖业务表 + 第三方表（todos/refresh_tokens/license_state）', () => {
    expect(Object.keys(pgSchema).sort()).toEqual(['licenseState', 'refreshTokens', 'todos'])
    expect(Object.keys(sqliteSchema).sort()).toEqual(['licenseState', 'refreshTokens', 'todos'])
  })
})
