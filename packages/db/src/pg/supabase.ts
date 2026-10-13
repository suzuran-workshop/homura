/**
 * supabase PG 直连构造：Supavisor pooler URL 拼装 + env 一次性解析。
 *
 * ⚠ 适用范围（2026-10-13 实测校准）：**仅自托管 Supabase / 独立 pgsql 部署**。
 * qw-pages 上 PG 直连不可用，两条独立原因：
 *  1. 平台只注入 SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_INSTANCE_ID，
 *     不下发 SUPABASE_PROJECT_REF / SUPABASE_DB_PASSWORD，且没有自定义 env 注入口 → loadSupabaseEnv 必抛；
 *  2. 出网只放行 443：对 supabase 主机 5432 的 TCP 连接实测 timeout（443 可连、PostgREST 200）。
 * 故 qw-pages 形态的数据层走 PostgREST（见 ../postgrest.ts），对象存储的 env 解析走
 * @homurajs/storage 的 loadSupabaseStorageEnv（不再复用本文件的 loader）。
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

/**
 * 从 env 解析 supabase **PG 直连**配置（自托管 Supabase / 独立 pgsql 部署）。
 *
 * 只返回 dbConfig：平台 URL 与 anon key 属于 REST 侧关注点，已移交
 * @homurajs/storage 的 loadSupabaseStorageEnv——旧版把两者混在一个 loader 里，
 * 导致「只要对象存储」的场景被 PG 凭据缺失一起拖死（模板 buildStorage 曾中招）。
 */
export function loadSupabaseEnv(env: NodeJS.ProcessEnv): { dbConfig: PgDbConfig } {
  const projectRef = env['SUPABASE_PROJECT_REF']
  const password = env['SUPABASE_DB_PASSWORD']
  if (!projectRef || !password) {
    throw new Error(
      'supabase PG 直连环境不完整：需要 SUPABASE_PROJECT_REF 与 SUPABASE_DB_PASSWORD。' +
        '（qw-pages 不下发这两项，且对 supabase 主机 5432 的出网实测 timeout → PG 直连在 Pages 上不可用；' +
        '请改用 dialect=rest 走 PostgREST。对象存储的 env 解析见 @homurajs/storage 的 loadSupabaseStorageEnv）',
    )
  }
  const dbConfig = buildSupabaseDbConfig({
    projectRef,
    password,
    region: env['SUPABASE_REGION'],
    pooler: env['SUPABASE_POOLER'] === 'session' ? 'session' : 'transaction',
  })
  return { dbConfig }
}
