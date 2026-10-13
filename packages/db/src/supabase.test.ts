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
    expect(() => buildSupabaseDbConfig({ projectRef: 'r', password: 'p' })).toThrow(/region.*host/)
  })
})

describe('loadSupabaseEnv — 仅 PG 直连（REST 侧 env 归 @homurajs/storage）', () => {
  it('完整 env → dbConfig（Supavisor transaction 模式）', () => {
    const { dbConfig } = loadSupabaseEnv({
      SUPABASE_PROJECT_REF: 'proj',
      SUPABASE_DB_PASSWORD: 'pw',
      SUPABASE_REGION: 'ap-northeast-1',
      SUPABASE_ANON_KEY: 'anon',
    })
    expect(dbConfig.url).toContain('postgres.proj:pw@aws-0-ap-northeast-1')
    expect(dbConfig.prepare).toBe(false)
  })

  it('不再返回 platformUrl/anonKey（避免与 storage 的 REST env 混淆）', () => {
    const loaded = loadSupabaseEnv({
      SUPABASE_PROJECT_REF: 'proj',
      SUPABASE_DB_PASSWORD: 'pw',
      SUPABASE_REGION: 'r',
    }) as Record<string, unknown>
    expect(Object.keys(loaded)).toEqual(['dbConfig'])
  })

  it('缺必需项抛错，并指路 PostgREST（qw-pages 场景）', () => {
    expect(() => loadSupabaseEnv({ SUPABASE_PROJECT_REF: 'x' })).toThrow(
      /SUPABASE_PROJECT_REF.*SUPABASE_DB_PASSWORD/,
    )
    // 只有 qw-pages 实测注入的那三项 → 仍然抛，且错误信息指向 rest
    expect(() =>
      loadSupabaseEnv({
        SUPABASE_URL: 'https://supabase.example',
        SUPABASE_ANON_KEY: 'anon',
        SUPABASE_INSTANCE_ID: 'i',
      }),
    ).toThrow(/PostgREST/)
  })
})
