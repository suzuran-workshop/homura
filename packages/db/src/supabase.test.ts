import { describe, expect, it } from 'vitest'
import { buildSupabaseDbConfig, loadSupabaseEnv } from './pg/supabase.js'

describe('buildSupabaseDbConfig', () => {
  it('transaction 模式（缺省）：Supavisor 443 + prepare:false + user 带 projectRef', () => {
    const cfg = buildSupabaseDbConfig({
      projectRef: 'abcdefghij',
      password: 'p@ss word',
      region: 'ap-southeast-1',
    })
    expect(cfg.dialect).toBe('pg')
    expect(cfg.url).toBe(
      'postgresql://postgres.abcdefghij:p%40ss%20word@aws-0-ap-southeast-1.pooler.supabase.com:443/postgres?sslmode=require',
    )
    expect(cfg.prepare).toBe(false)
    expect(cfg.ssl).toBe(true)
  })

  it('session 模式：user 为 postgres、prepare 默认 true', () => {
    const cfg = buildSupabaseDbConfig({
      projectRef: 'ref',
      password: 'pw',
      host: 'db.example.com',
      pooler: 'session',
    })
    expect(cfg.url).toContain('postgresql://postgres:pw@db.example.com:443/')
    expect(cfg.prepare).toBe(true)
  })

  it('缺 region 且缺 host 时抛错', () => {
    expect(() =>
      buildSupabaseDbConfig({ projectRef: 'r', password: 'p' }),
    ).toThrow(/region.*host/)
  })
})

describe('loadSupabaseEnv', () => {
  it('完整 env → dbConfig + 平台 URL 缺省推导', () => {
    const { dbConfig, platformUrl, anonKey } = loadSupabaseEnv({
      SUPABASE_PROJECT_REF: 'proj',
      SUPABASE_DB_PASSWORD: 'pw',
      SUPABASE_REGION: 'ap-northeast-1',
      SUPABASE_ANON_KEY: 'anon',
    })
    expect(dbConfig.url).toContain('postgres.proj:pw@aws-0-ap-northeast-1')
    expect(platformUrl).toBe('https://proj.supabase.co')
    expect(anonKey).toBe('anon')
  })

  it('缺必需项抛错', () => {
    expect(() => loadSupabaseEnv({ SUPABASE_PROJECT_REF: 'x' })).toThrow(
      /SUPABASE_PROJECT_REF.*SUPABASE_DB_PASSWORD/,
    )
  })
})
