import { describe, expect, it } from 'vitest'
import { assertSchemaParity } from '@homurajs/db'
import { pgSchema } from './pg.js'
import { sqliteSchema } from './sqlite.js'
import { restSchema, todosRest } from './rest.js'

/**
 * 方言 parity 硬门禁（活文档：模板自己守这条纪律）。
 * pg ↔ sqlite 靠 assertSchemaParity 比对；rest 侧是**派生**的（见 rest.ts），
 * 一致性由构造保证，这里只锁「派生结果确实是 pg 的真实列名」这条不变量。
 */
describe('schema parity（pg ↔ sqlite）', () => {
  it('表名/列名/主键一致', () => {
    expect(() => assertSchemaParity(pgSchema, sqliteSchema)).not.toThrow()
  })

  it('覆盖业务表 + 第三方表（todos/refresh_tokens/license_state/homura_files/homura_file_chunks + auth 新表）', () => {
    const expected = [
      'homuraFileChunks', 'homuraFiles', 'licenseState', 'oauth2IdentityLinks',
      'passwords', 'refreshTokens', 'todos', 'users', 'webauthnCredentials',
    ]
    expect(Object.keys(pgSchema).sort()).toEqual(expected)
    expect(Object.keys(sqliteSchema).sort()).toEqual(expected)
  })
})

describe('schema parity（rest 派生自 pg）', () => {
  it('表集合与 pg 侧一致（派生不漏表）', () => {
    expect(Object.keys(restSchema).sort()).toEqual(Object.keys(pgSchema).sort())
  })

  it('todos 的 REST 列名 = pgCol 配方产出的 camelCase 真实列名', () => {
    // 这条锁住最容易踩的坑：pgCol 不传 name 时列名是 JS 属性名（ownerSub/createdAt），
    // 手写第三份 schema 极易错写成 owner_sub/created_at，而 PostgREST 会直接 400。
    expect(todosRest.columns).toEqual(['id', 'title', 'done', 'ownerSub', 'createdAt', 'meta'])
    expect(todosRest.columns).not.toContain('owner_sub')
  })

  it('第三方表（走原生 SQL、显式 snake_case 列名）派生后仍是 snake_case', () => {
    const refresh = restSchema['refreshTokens']
    expect(refresh?.table).toBe('refresh_tokens')
    expect(refresh?.columns.some((c) => c.includes('_'))).toBe(true)
  })
})
