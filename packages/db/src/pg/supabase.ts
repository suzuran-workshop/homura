/**
 * supabase PG 直连构造：Supavisor pooler URL 拼装 + env 一次性解析。
 * qw-pages 允许 TCP 出网，supabase 即 PG 直连（PostgREST 仅 storage/auth 用）。
 */
import type { PgDbConfig } from '../types.js'

export interface SupabasePgOptions {
  /** SUPABASE_PROJECT_REF */
  projectRef: string
  /** SUPABASE_DB_PASSWORD */
  password: string
  region?: string
  /** 默认 transaction 模式下 'postgres.<ref>'（Supavisor 格式）；session 模式下 'postgres' */
  user?: string
  db?: string
  /** 默认 transaction（Serverless 适用） */
  pooler?: 'transaction' | 'session'
  host?: string
  /** 默认 443（Supavisor 支持 443 上的 PG 协议，只放行 443 出网的环境友好） */
  port?: number
}

/** transaction 模式自动附加 prepare:false 约定（返回完整 config） */
export function buildSupabaseDbConfig(opts: SupabasePgOptions): PgDbConfig {
  const pooler = opts.pooler ?? 'transaction'
  const host = opts.host ?? (opts.region ? `aws-0-${opts.region}.pooler.supabase.com` : undefined)
  if (!host) throw new Error('supabase 连接需要 region 或显式 host')
  const port = opts.port ?? 443
  const user = opts.user ?? (pooler === 'transaction' ? `postgres.${opts.projectRef}` : 'postgres')
  const url = `postgresql://${user}:${encodeURIComponent(opts.password)}@${host}:${port}/${opts.db ?? 'postgres'}?sslmode=require`
  // Supavisor transaction 模式不支持 prepared statements
  const prepare = pooler === 'transaction' ? false : true
  return { dialect: 'pg', url, prepare, ssl: true }
}

/** 从 env 解析 supabase 全套：pg 直连 + 平台 URL/anonKey（供 storage 用） */
export function loadSupabaseEnv(env: NodeJS.ProcessEnv): {
  dbConfig: PgDbConfig
  platformUrl: string
  anonKey: string
} {
  const projectRef = env['SUPABASE_PROJECT_REF']
  const password = env['SUPABASE_DB_PASSWORD']
  if (!projectRef || !password) {
    throw new Error('supabase 环境不完整：需要 SUPABASE_PROJECT_REF 与 SUPABASE_DB_PASSWORD')
  }
  const anonKey = env['SUPABASE_ANON_KEY'] ?? ''
  const platformUrl = env['SUPABASE_PLATFORM_URL'] ?? `https://${projectRef}.supabase.co`
  const dbConfig = buildSupabaseDbConfig({
    projectRef,
    password,
    region: env['SUPABASE_REGION'],
    pooler: env['SUPABASE_POOLER'] === 'session' ? 'session' : 'transaction',
  })
  return { dbConfig, platformUrl, anonKey }
}
