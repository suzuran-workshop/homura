/**
 * 环境配置（defineConfig：配置即文档）。
 * 渐进式：每能力一组独立 env，缺省则不启用该能力。
 * .env.example 由 `node scripts/gen-env-example.mjs` 生成（见 package.json gen:env）。
 */
import { defineConfig, parses } from '@homurajs/core'

export const configSpecs = {
  // ── 基础 ──
  port: { env: 'PORT', default: 3000, parse: parses.int, description: '监听端口（standalone）' },
  dialect: {
    env: 'DIALECT',
    default: 'sqlite' as 'sqlite' | 'pg',
    parse: (raw: string) => (raw === 'pg' ? ('pg' as const) : ('sqlite' as const)),
    description: "数据库方言：'sqlite'（node:sqlite）| 'pg'（pgsql/supabase）",
  },
  sessionSecret: {
    env: 'SESSION_SECRET',
    default: 'dev-only-insecure-secret-change-me-32bytes!',
    parse: parses.string,
    secret: true,
    description: 'session HS256 密钥（>=32B，生产必须改）',
  },

  // ── db: pg / supabase ──
  databaseUrl: { env: 'DATABASE_URL', parse: parses.string, description: 'pg 直连 URL（dialect=pg 且非 supabase 时）' },
  supabaseProjectRef: { env: 'SUPABASE_PROJECT_REF', parse: parses.string, description: 'supabase project ref（qw-pages 形态）' },
  supabaseDbPassword: { env: 'SUPABASE_DB_PASSWORD', parse: parses.string, secret: true, description: 'supabase DB 密码' },
  supabaseRegion: { env: 'SUPABASE_REGION', parse: parses.string, description: 'supabase region（Supavisor host 拼装）' },
  supabaseAnonKey: { env: 'SUPABASE_ANON_KEY', parse: parses.string, secret: true, description: 'supabase anon key（storage 用）' },
  sqlitePath: { env: 'SQLITE_PATH', default: './data/app.db', parse: parses.string, description: 'sqlite 文件路径（:memory: 支持）' },

  // ── auth: oauth2-dingtalk ──
  oauthOrgId: { env: 'OAUTH_DINGTALK_ORG_ID', parse: parses.string, description: 'oauth2-dingtalk 组织标识（配置即启用登录）' },
  oauthBaseUrl: { env: 'OAUTH_DINGTALK_BASE_URL', parse: parses.string, description: 'oauth2-dingtalk 部署地址（默认线上）' },
  oauthClientId: { env: 'OAUTH_CLIENT_ID', parse: parses.string, description: 'OAuth2 client id（= 钉钉 AppKey）' },
  oauthClientSecret: { env: 'OAUTH_CLIENT_SECRET', parse: parses.string, secret: true, description: 'OAuth2 client secret' },
  oauthRedirectUri: { env: 'OAUTH_REDIRECT_URI', parse: parses.string, description: '回调地址（如 https://app.example/auth/callback）' },

  // ── 3p: dingtalk 平台能力 ──
  dingtalkAppKey: { env: 'DINGTALK_APP_KEY', parse: parses.string, description: '钉钉企业应用 AppKey（配置即启用 3p）' },
  dingtalkAppSecret: { env: 'DINGTALK_APP_SECRET', parse: parses.string, secret: true, description: '钉钉企业应用 AppSecret' },
  dingtalkAgentId: { env: 'DINGTALK_AGENT_ID', parse: parses.string, description: '钉钉 AgentId（工作通知用）' },

  // ── storage ──
  storageBackend: {
    env: 'STORAGE_BACKEND',
    default: 'none' as 'none' | 'local' | 's3' | 'supabase',
    parse: (raw: string) => raw as 'none' | 'local' | 's3' | 'supabase',
    description: "存储后端：none（不启用）| local | s3 | supabase",
  },
  localStorageDir: { env: 'STORAGE_LOCAL_DIR', default: './data/files', parse: parses.string, description: 'local 存储根目录' },
  s3Endpoint: { env: 'S3_ENDPOINT', parse: parses.string, description: 's3 兼容端点' },
  s3Region: { env: 'S3_REGION', default: 'us-east-1', parse: parses.string, description: 's3 region' },
  s3Bucket: { env: 'S3_BUCKET', parse: parses.string, description: 's3 bucket' },
  s3AccessKey: { env: 'S3_ACCESS_KEY', parse: parses.string, secret: true, description: 's3 access key' },
  s3SecretKey: { env: 'S3_SECRET_KEY', parse: parses.string, secret: true, description: 's3 secret key' },

  // ── license: homura-genuine ──
  genuineServer: { env: 'GENUINE_SERVER', parse: parses.string, description: 'homura-genuine 地址（配置即启用激活守卫）' },
  genuineProductId: { env: 'GENUINE_PRODUCT_ID', parse: parses.string, description: 'license productId' },
  genuineAppId: { env: 'GENUINE_APP_ID', parse: parses.string, description: 'license appId' },
  genuineLicenseKey: { env: 'GENUINE_LICENSE_KEY', parse: parses.string, secret: true, description: 'license key（可选）' },

  // ── 静态资源 ──
  assetsDir: { env: 'HOMURA_ASSETS_DIR', parse: parses.string, description: '前端静态资源目录（默认由 adapter 决定）' },
} as const

export type AppConfig = ReturnType<typeof loadConfig>

export function loadConfig(env?: NodeJS.ProcessEnv) {
  return defineConfig(configSpecs).load(env)
}
