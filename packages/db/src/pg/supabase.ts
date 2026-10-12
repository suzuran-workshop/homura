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
  /** 默认 'postgres.<ref>'（Supavisor session/transaction 格式） */
  user?: string
  db?: string
  /** 默认 transaction（Serverless 适用） */
  pooler?: 'transaction' | 'session'
  host?: string
  port?: number
}

/** transaction 模式自动附加 prepare:false 约定（返回完整 config） */
export function buildSupabaseDbConfig(opts: SupabasePgOptions): PgDbConfig {
  throw new Error('NotImplemented: buildSupabaseDbConfig')
}

/** 从 env 解析 supabase 全套：pg 直连 + 平台 URL/anonKey（供 storage 用） */
export function loadSupabaseEnv(env: NodeJS.ProcessEnv): {
  dbConfig: PgDbConfig
  platformUrl: string
  anonKey: string
} {
  throw new Error('NotImplemented: loadSupabaseEnv')
}
