/**
 * 环境配置（defineConfig：配置即文档）。
 * 渐进式：每能力一组独立 env，缺省则不启用该能力。
 * .env.example 由 `node scripts/gen-env-example.mjs` 生成（见 package.json gen:env）。
 */
import { applyEnvFile, defineConfig, parses } from '@homurajs/core'

export type Dialect = 'sqlite' | 'pg'

export const configSpecs = {
  // ── 基础 ──
  port: {
    env: 'PORT',
    default: 3000,
    parse: parses.int,
    description: '监听端口',
  },
  dialect: {
    env: 'DIALECT',
    default: 'sqlite' as Dialect,
    parse: (raw: string): Dialect => (raw === 'pg' ? 'pg' : 'sqlite'),
    description:
      "数据方言：'sqlite'（node:sqlite 本地文件，缺省）| 'pg'（自建 pgsql / 自托管 supabase 直连）",
  },
  sessionSecret: {
    env: 'SESSION_SECRET',
    default: 'dev-only-insecure-secret-change-me-32bytes!',
    parse: parses.string,
    secret: true,
    description: 'session HS256 密钥（>=32B，生产必须改）',
  },

  // ── db: pg 直连（自建 pgsql / 自托管 supabase）──
  databaseUrl: {
    env: 'DATABASE_URL',
    parse: parses.string,
    description: 'pg 直连 URL（dialect=pg 且非 supabase 时）',
  },
  supabaseProjectRef: {
    env: 'SUPABASE_PROJECT_REF',
    parse: parses.string,
    description: 'supabase project ref（仅自托管 supabase 的 PG 直连）',
  },
  supabaseDbPassword: {
    env: 'SUPABASE_DB_PASSWORD',
    parse: parses.string,
    secret: true,
    description: 'supabase DB 密码（仅自托管）',
  },
  supabaseRegion: {
    env: 'SUPABASE_REGION',
    parse: parses.string,
    description: 'supabase region（Supavisor host 拼装）',
  },

  // ── supabase storage（后端读 SUPABASE_URL / SUPABASE_ANON_KEY，独立部署自行设置）──
  supabaseBucket: {
    env: 'STORAGE_SUPABASE_BUCKET',
    default: 'files',
    parse: parses.string,
    description: 'supabase 存储桶名（必须预先存在：anon 无建桶权）',
  },
  sqlitePath: {
    env: 'SQLITE_PATH',
    default: './data/app.db',
    parse: parses.string,
    description: 'sqlite 文件路径（:memory: 支持）',
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

/** 仓库里公开的缺省密钥：生产禁止沿用（HS256 密钥公开 = 会话可伪造） */
export const INSECURE_SESSION_SECRET = 'dev-only-insecure-secret-change-me-32bytes!'

export interface LoadConfigOptions {
  /** false = 不读配置文件；string = 指定路径；缺省 = 按 core resolveConfigFilePath 的优先级自动定位 */
  configFile?: string | false
}

/**
 * 载入配置：先把部署期配置文件并入 env，再走 defineConfig，最后校验密钥。
 *
 * 配置文件让密钥类值可以随部署产物携带（或放运维可写区轮换），其信任边界与代码本身相同。
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
 * 生产禁止沿用仓库里公开的缺省 SESSION_SECRET。
 *
 * 这不是洁癖：session 用 HS256 自签自验，签名密钥一旦公开，任何人都能伪造
 * access/refresh token 冒充任意用户（含绕过 license 停服后的用户态）。
 * 很容易顺手拿缺省值上线，故在启动期直接拒绝。
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
  const production = env['NODE_ENV'] === 'production'
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
        '生产拒绝启动（HS256 密钥公开等于任何人可伪造会话）。' +
        '请通过 homura.config.env（随部署产物携带）或真实环境变量提供 >=32B 随机值。',
    )
  }
}
