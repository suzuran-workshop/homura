/**
 * 环境配置（defineConfig：配置即文档）。
 * 渐进式：每能力一组独立 env，缺省则不启用该能力。
 * .env.example 由 `node scripts/gen-env-example.mjs` 生成（见 package.json gen:env）。
 */
import { defineConfig, detectRuntime, parses } from '@homurajs/core'

export type Dialect = 'sqlite' | 'pg' | 'rest'

export const configSpecs = {
  // ── 基础 ──
  port: {
    env: 'PORT',
    default: 3000,
    parse: parses.int,
    description: '监听端口（standalone；qw-pages 由平台注入 PORT）',
  },
  dialect: {
    env: 'DIALECT',
    // 刻意不给 default：缺省值按运行形态解析（见 resolveDialect），
    // 因为「sqlite 单机」与「rest 云托管」是两个形态各自的正确答案。
    parse: (raw: string): Dialect => (raw === 'pg' ? 'pg' : raw === 'rest' ? 'rest' : 'sqlite'),
    description:
      "数据方言：'sqlite'（node:sqlite 本地文件）| 'pg'（自建 pgsql / 自托管 supabase 直连）| 'rest'（PostgREST，qw-pages 唯一可用）。缺省：standalone→sqlite，qw-pages→rest",
  },
  sessionSecret: {
    env: 'SESSION_SECRET',
    default: 'dev-only-insecure-secret-change-me-32bytes!',
    parse: parses.string,
    secret: true,
    description: 'session HS256 密钥（>=32B，生产必须改）',
  },

  // ── db: pg 直连（自建 pgsql / 自托管 supabase；qw-pages 不适用）──
  databaseUrl: {
    env: 'DATABASE_URL',
    parse: parses.string,
    description: 'pg 直连 URL（dialect=pg 且非 supabase 时）',
  },
  supabaseProjectRef: {
    env: 'SUPABASE_PROJECT_REF',
    parse: parses.string,
    description: 'supabase project ref（仅自托管 supabase 的 PG 直连；qw-pages 不下发）',
  },
  supabaseDbPassword: {
    env: 'SUPABASE_DB_PASSWORD',
    parse: parses.string,
    secret: true,
    description: 'supabase DB 密码（仅自托管；qw-pages 不下发）',
  },
  supabaseRegion: {
    env: 'SUPABASE_REGION',
    parse: parses.string,
    description: 'supabase region（Supavisor host 拼装）',
  },

  // ── supabase REST（qw-pages 自动注入这两项：数据层 PostgREST + 对象存储共用）──
  supabaseUrl: {
    env: 'SUPABASE_URL',
    parse: parses.string,
    description: 'supabase 平台 URL（qw-pages 自动注入）',
  },
  supabaseAnonKey: {
    env: 'SUPABASE_ANON_KEY',
    parse: parses.string,
    secret: true,
    description: 'supabase anon key（PostgREST 与 storage 用；qw-pages 自动注入）',
  },
  supabaseBucket: {
    env: 'STORAGE_SUPABASE_BUCKET',
    default: 'files',
    parse: parses.string,
    description: 'supabase 存储桶名（必须预先存在：qw-pages 上 anon 与迁移角色都无建桶权）',
  },
  sqlitePath: {
    env: 'SQLITE_PATH',
    default: './data/app.db',
    parse: parses.string,
    description: 'sqlite 文件路径（:memory: 支持；仅 standalone）',
  },

  // ── auth: oauth2-dingtalk ──
  oauthOrgId: {
    env: 'OAUTH_DINGTALK_ORG_ID',
    parse: parses.string,
    description: 'oauth2-dingtalk 组织标识（配置即启用登录）',
  },
  oauthBaseUrl: {
    env: 'OAUTH_DINGTALK_BASE_URL',
    parse: parses.string,
    description: 'oauth2-dingtalk 部署地址（默认线上）',
  },
  oauthClientId: {
    env: 'OAUTH_CLIENT_ID',
    parse: parses.string,
    description: 'OAuth2 client id（= 钉钉 AppKey）',
  },
  oauthClientSecret: {
    env: 'OAUTH_CLIENT_SECRET',
    parse: parses.string,
    secret: true,
    description: 'OAuth2 client secret',
  },
  oauthRedirectUri: {
    env: 'OAUTH_REDIRECT_URI',
    parse: parses.string,
    description: '回调地址（如 https://app.example/auth/callback）',
  },

  // ── 3p: dingtalk 平台能力 ──
  dingtalkAppKey: {
    env: 'DINGTALK_APP_KEY',
    parse: parses.string,
    description: '钉钉企业应用 AppKey（配置即启用 3p）',
  },
  dingtalkAppSecret: {
    env: 'DINGTALK_APP_SECRET',
    parse: parses.string,
    secret: true,
    description: '钉钉企业应用 AppSecret',
  },
  dingtalkAgentId: {
    env: 'DINGTALK_AGENT_ID',
    parse: parses.string,
    description: '钉钉 AgentId（工作通知用）',
  },

  // ── storage ──
  storageBackend: {
    env: 'STORAGE_BACKEND',
    default: 'none' as 'none' | 'local' | 's3' | 'supabase',
    parse: (raw: string) => raw as 'none' | 'local' | 's3' | 'supabase',
    description: '存储后端：none（不启用）| local | s3 | supabase',
  },
  localStorageDir: {
    env: 'STORAGE_LOCAL_DIR',
    default: './data/files',
    parse: parses.string,
    description: 'local 存储根目录',
  },
  s3Endpoint: { env: 'S3_ENDPOINT', parse: parses.string, description: 's3 兼容端点' },
  s3Region: {
    env: 'S3_REGION',
    default: 'us-east-1',
    parse: parses.string,
    description: 's3 region',
  },
  s3Bucket: { env: 'S3_BUCKET', parse: parses.string, description: 's3 bucket' },
  s3AccessKey: {
    env: 'S3_ACCESS_KEY',
    parse: parses.string,
    secret: true,
    description: 's3 access key',
  },
  s3SecretKey: {
    env: 'S3_SECRET_KEY',
    parse: parses.string,
    secret: true,
    description: 's3 secret key',
  },

  // ── license: homura-genuine ──
  genuineServer: {
    env: 'GENUINE_SERVER',
    parse: parses.string,
    description: 'homura-genuine 地址（配置即启用激活守卫）',
  },
  genuineProductId: {
    env: 'GENUINE_PRODUCT_ID',
    parse: parses.string,
    description: 'license productId',
  },
  genuineAppId: { env: 'GENUINE_APP_ID', parse: parses.string, description: 'license appId' },
  genuineLicenseKey: {
    env: 'GENUINE_LICENSE_KEY',
    parse: parses.string,
    secret: true,
    description: 'license key（可选）',
  },

  // ── 静态资源 ──
  assetsDir: {
    env: 'HOMURA_ASSETS_DIR',
    parse: parses.string,
    description: '前端静态资源目录（默认由 adapter 决定）',
  },
} as const

export type AppConfig = ReturnType<typeof loadConfig>

export function loadConfig(env?: NodeJS.ProcessEnv) {
  return defineConfig(configSpecs).load(env)
}

/**
 * 方言解析：显式 DIALECT 优先；未显式设置时按运行形态取缺省
 * （standalone → sqlite，qw-pages → rest）。
 *
 * 为什么 qw-pages 的缺省必须是 rest（2026-10-13 线上实测，逐项见 docs/specs/module-qw-pages.md）：
 * - sqlite 不可用：应用根目录对进程只读（实测 `mkdir ./data` → EACCES），
 *   唯一可写的 QWENWORK_WRITABLE_DIR 跨发布清空（实测重发布后历史文件消失）→ 数据必丢；
 * - pg 直连不可用：平台不下发 SUPABASE_PROJECT_REF / SUPABASE_DB_PASSWORD / DATABASE_URL，
 *   且对 supabase 主机 5432 的 TCP 连接 timeout（443 可连）；
 * - rest 可用且持久：PostgREST 全套算子实测通过，跨发布回读旧行成功。
 */
export function resolveDialect(config: AppConfig, env: NodeJS.ProcessEnv = process.env): Dialect {
  const explicit = config.get('dialect')
  if (explicit) return explicit
  return detectRuntime(env).target === 'qw-pages' ? 'rest' : 'sqlite'
}
