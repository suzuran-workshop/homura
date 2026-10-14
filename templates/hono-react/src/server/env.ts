/**
 * 环境配置（defineConfig：配置即文档）。
 * 渐进式：每能力一组独立 env，缺省则不启用该能力。
 * .env.example 由 `node scripts/gen-env-example.mjs` 生成（见 package.json gen:env）。
 */
import { applyEnvFile, defineConfig, detectRuntime, parses } from '@homurajs/core'

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
    description: '回调地址（如 https://app.example/auth/oauth2/callback）',
  },
  authOauth2Jit: {
    env: 'AUTH_OAUTH2_JIT',
    default: true,
    parse: parses.boolean,
    description: 'OAuth2 首次登录是否自动建户（JIT provisioning）；false 则要求预先注册并关联',
  },
  authPasswordEnabled: {
    env: 'AUTH_PASSWORD_ENABLED',
    // 缺省 false：渐进式能力包「配了啥才启用啥」——密码认证与 OAuth2（靠 oauthOrgId）/
    // WebAuthn（靠 AUTH_WEBAUTHN_ENABLED）一样是 opt-in。此前缺省 true 会让「只配了 OAuth2」
    // 的部署连带开放密码自助注册，违反能力独立开关的契约。
    default: false,
    parse: parses.boolean,
    description: '是否启用用户名密码认证（TextPassword）；缺省 false（opt-in，配了才启用）',
  },
  authPasswordAllowSelfRegister: {
    env: 'AUTH_PASSWORD_ALLOW_SELF_REGISTER',
    default: true,
    parse: parses.boolean,
    description: '是否允许自助注册（false 则只能由管理员创建账户）',
  },
  authWebauthnEnabled: {
    env: 'AUTH_WEBAUTHN_ENABLED',
    default: false,
    parse: parses.boolean,
    description: '是否启用 WebAuthn（Passkey）认证',
  },
  authWebauthnRpId: {
    env: 'AUTH_WEBAUTHN_RP_ID',
    parse: parses.string,
    description: 'WebAuthn RP ID（通常是域名，如 app.example.com）',
  },
  authWebauthnRpName: {
    env: 'AUTH_WEBAUTHN_RP_NAME',
    parse: parses.string,
    description: 'WebAuthn RP 显示名称（如 "My App"）',
  },
  authWebauthnOrigin: {
    env: 'AUTH_WEBAUTHN_ORIGIN',
    parse: parses.string,
    description: 'WebAuthn 允许的 origin（如 https://app.example.com；多 origin 用逗号分隔）',
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
    default: 'none' as 'none' | 'local' | 's3' | 'supabase' | 'db',
    parse: (raw: string) => raw as 'none' | 'local' | 's3' | 'supabase' | 'db',
    description:
      '存储后端：none（不启用）| local | s3 | supabase | db（二进制写进数据库，qw-pages 唯一可用，有大小上限）',
  },
  localStorageDir: {
    env: 'STORAGE_LOCAL_DIR',
    default: './data/files',
    parse: parses.string,
    description: 'local 存储根目录',
  },
  storageDbMaxBytes: {
    env: 'STORAGE_DB_MAX_BYTES',
    default: 50 * 1024 * 1024,
    parse: (raw: string) => {
      const n = Number(raw)
      if (!Number.isFinite(n) || n <= 0) throw new Error('STORAGE_DB_MAX_BYTES 必须是正整数（字节）')
      return n
    },
    description: 'db 后端单文件总上限（字节），超限即拒；缺省 50MB。大文件请改用 s3 预签名直传',
  },
  storageDbChunkSize: {
    env: 'STORAGE_DB_CHUNK_SIZE',
    default: 384 * 1024,
    parse: (raw: string) => {
      const n = Number(raw)
      if (!Number.isFinite(n) || n <= 0) throw new Error('STORAGE_DB_CHUNK_SIZE 必须是正整数（字节）')
      return n
    },
    description:
      'db 后端每块原始字节数；缺省 384KB（base64 入库后 512KB，安全避开 qw-pages 网关与 PostgREST 的 ~1MB 限制）',
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
  s3ForcePathStyle: {
    env: 'S3_FORCE_PATH_STYLE',
    default: true,
    parse: parses.boolean,
    description:
      's3 寻址风格：true=path-style（minio 缺省）；阿里云 OSS 必须 false（virtual-hosted，否则对象操作报 SecondLevelDomainForbidden）',
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
    description: 'license key（可选；中心预签发时用它绑定实例）',
  },
  genuinePublicKey: {
    env: 'GENUINE_PUBLIC_KEY',
    parse: parses.string,
    description:
      '中心 Ed25519 公钥 PEM。**配了才验签**，生产必配（否则中心响应可被中间人改成 active）。' +
      'PEM 是多行，写进 homura.config.env 时用双引号包裹并把换行写成 \\n',
  },
  genuineCorePaths: {
    env: 'GENUINE_CORE_PATHS',
    default: '/api',
    parse: parses.string,
    description:
      "enforcement=core 时视为核心功能的路径前缀，逗号分隔（如 '/api,/admin'）；命中即 503，其余放行 + 强提醒",
  },

  // ── 静态资源 ──
  assetsDir: {
    env: 'HOMURA_ASSETS_DIR',
    parse: parses.string,
    description: '前端静态资源目录（默认由 adapter 决定）',
  },
} as const

export type AppConfig = ReturnType<typeof loadConfig>

/** 仓库里公开的缺省密钥：生产 / qw-pages 形态禁止沿用（HS256 密钥公开 = 会话可伪造） */
export const INSECURE_SESSION_SECRET = 'dev-only-insecure-secret-change-me-32bytes!'

export interface LoadConfigOptions {
  /** false = 不读配置文件；string = 指定路径；缺省 = 按 core resolveConfigFilePath 的优先级自动定位 */
  configFile?: string | false
}

/**
 * 载入配置：先把部署期配置文件并入 env，再走 defineConfig，最后校验密钥。
 *
 * 为什么必须有配置文件这条路：qw-pages 只注入固定 12 个 env 且**无自定义注入口**（实测），
 * SESSION_SECRET / OAUTH_CLIENT_SECRET 这类值无法用环境变量投递；而部署产物不可被公网读取
 * （实测：/server/*.mjs 与 /homura.manifest.json 一律被 SPA fallback 兜成 index.html，
 * %2e%2e 变体被网关 400，真实 /assets/*.js 正常返回），故随产物携带 homura.config.env
 * 是可行通道，其信任边界与代码本身相同。
 *
 * 优先级：真实 env > 文件。文件位置优先级见 core 的 resolveConfigFilePath
 * （HOMURA_CONFIG_FILE → <cwd>/homura.config.env → QWENWORK_WRITABLE_DIR/homura.config.env）。
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env, opts: LoadConfigOptions = {}) {
  if (opts.configFile !== false) {
    applyEnvFile(env, typeof opts.configFile === 'string' ? { path: opts.configFile } : {})
  }
  const config = defineConfig(configSpecs).load(env)
  assertSecretsOverridden(config, env)
  return config
}

/**
 * 生产 / qw-pages 形态禁止沿用仓库里公开的缺省 SESSION_SECRET。
 *
 * 这不是洁癖：session 用 HS256 自签自验，签名密钥一旦公开，任何人都能伪造
 * access/refresh token 冒充任意用户（含绕过 license 停服后的用户态）。
 * 而 Pages 上无法用 env 投递密钥，很容易顺手拿缺省值上线，故在启动期直接拒绝。
 *
 * ⚠ 只在**真的会签 session** 时拦：OAuth2 / TextPassword / WebAuthn 任一启用都会签 JWT，
 *   三者全关的纯匿名 App 根本不用这个密钥，无条件拦会误伤——冷启动验收发现过这个 bug
 *   （Pages 上纯匿名 App 也无法启动）。
 *   历史教训：本检查曾只看 oauthOrgId，导致「纯密码认证 + 公开缺省密钥」的生产部署
 *   静默放行（密码认证缺省即开），任何人可伪造会话——务必覆盖所有签 session 的形态。
 *
 * 新增带 default 的 secret 配置项、或新增会签 session 的认证形态时，请一并加入这里的检查。
 */
export function assertSecretsOverridden(
  config: AppConfig,
  env: NodeJS.ProcessEnv = process.env,
): void {
  const production = detectRuntime(env).target === 'qw-pages' || env['NODE_ENV'] === 'production'
  if (!production) return
  // 未启用任何会签 session 的认证 → 不签 JWT → 缺省密钥无害，放行
  const signsSession =
    Boolean(config.get('oauthOrgId')) ||
    config.get('authPasswordEnabled') ||
    config.get('authWebauthnEnabled')
  if (!signsSession) return
  if (config.get('sessionSecret') === INSECURE_SESSION_SECRET) {
    throw new Error(
      'SESSION_SECRET 仍是仓库里公开的缺省值，而本 App 启用了登录（OAuth2 / 密码 / WebAuthn 至少其一）：' +
        '生产 / qw-pages 形态拒绝启动（HS256 密钥公开等于任何人可伪造会话）。' +
        '请通过 homura.config.env（随部署产物携带，或放平台的 QWENWORK_WRITABLE_DIR）' +
        '或真实环境变量提供 >=32B 随机值。',
    )
  }
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
