/**
 * buildApp：渐进式装配核心（活文档）。
 *
 * 纯函数式组装——从 AppConfig 读出「启用了哪些能力」，逐级注入 createApp：
 *   层级 0：纯 routes + 健康检查（永远可跑）
 *   层级 1：db（DIALECT，sqlite / pg）→ todos repository
 *   层级 2：auth（OAUTH_DINGTALK_ORG_ID / AUTH_PASSWORD_ENABLED / AUTH_WEBAUTHN_ENABLED）→ 登录链
 *   层级 3：3p（DINGTALK_APP_KEY）→ 平台能力协商
 *   层级 4：storage（STORAGE_BACKEND）→ 上传/下载
 *   层级 5：license（GENUINE_SERVER）→ 激活守卫
 *
 * e2e 测试通过 overrides 注入桩实例（db/fetch），走真实装配路径。
 */
import { Hono } from 'hono'
import {
  createApp,
  type AppDeps,
  type AuthInject,
  type HealthCheck,
  type LicenseInject,
} from '@homurajs/app-kit'
import type { Logger } from '@homurajs/core'
import type { FileStorage } from '@homurajs/storage'
import type { AppConfig } from './env.js'
import { buildDb, migrate } from './db.js'
import { buildTodoRepo, type TodoRepo } from './todos-repo.js'
import { buildApiRoutes } from './routes/api.js'
import { buildFileRoutes } from './routes/files.js'
import { buildPlatformRoutes } from './routes/platform.js'
import { buildLicenseDemoRoutes } from './routes/license-demo.js'

export interface BuildAppOverrides {
  /** 注入已建好的 db（e2e 用 :memory:）；不传则按 config 建 */
  db?: { db: Parameters<typeof buildTodoRepo>[0]; dialect: 'sqlite' | 'pg' }
  /** 注入 storage（e2e 用 local tmpdir）；不传则按 config 建 */
  storage?: FileStorage
  /** 注入 fetch（e2e 桩 OAuth/genuine） */
  fetchImpl?: typeof fetch
  logger?: Logger
  /** 静态资源目录（adapter 传入） */
  staticDir?: string
  /** 跳过迁移（e2e 用原生 DDL 建表时） */
  skipMigrate?: boolean
  /**
   * cookie 是否置 Secure。入口层传 adapter.trustProxy()：
   * 置于反向代理后（公网 https）设 TRUST_PROXY=1 即自动开启。
   */
  secureCookies?: boolean
}

export interface BuiltApp {
  app: Hono
  /** 实际注册的健康检查路径（与 license guard 豁免清单同源） */
  healthzPath: string
  /** 供入口层启动后使用（license 心跳、db 关闭等） */
  deps: AppDeps & { dbBundle?: { db: unknown; dialect: 'sqlite' | 'pg' }; todoRepo?: TodoRepo }
  /** 生命周期钩子：入口在 start 后调用 */
  onStart?: () => Promise<void> | void
  onStop?: () => Promise<void> | void
}

export async function buildApp(
  config: AppConfig,
  overrides: BuildAppOverrides = {},
): Promise<BuiltApp> {
  const logger = overrides.logger
  const fetchImpl = overrides.fetchImpl
  const secureCookies = overrides.secureCookies ?? false

  // ── 层级 1：db（sqlite / pg）──
  const dialect = config.get('dialect') ?? 'sqlite'
  const genuineServer = config.get('genuineServer')

  const dbBundle = overrides.db ?? (await buildDb(config, dialect))
  if (!overrides.skipMigrate) {
    await migrate(dbBundle)
  }
  const todoRepo: TodoRepo = buildTodoRepo(dbBundle.db, dbBundle.dialect)

  // ── 层级 2：auth（OIDC / Password / WebAuthn 任一启用即挂载）──
  const oauthOrgId = config.get('oauthOrgId')
  const authPasswordEnabled = config.get('authPasswordEnabled')
  const authWebauthnEnabled = config.get('authWebauthnEnabled')
  const anyAuth = Boolean(oauthOrgId) || authPasswordEnabled || authWebauthnEnabled
  let auth: AuthInject | false = false
  if (anyAuth) {
    auth = await buildAuth(config, dbBundle.db, fetchImpl, secureCookies, logger)
  }

  // ── 层级 3：3p 平台（DINGTALK_APP_KEY 配置即启用）──
  let thirdParty: { platform: import('@homurajs/app-kit').PlatformLike } | undefined
  let platformRoutes: Hono | undefined
  const dingtalkAppKey = config.get('dingtalkAppKey')
  if (dingtalkAppKey && config.get('dingtalkAppSecret')) {
    const { createDingtalkPlatform } = await import('@homurajs/3p/dingtalk')
    const platform = createDingtalkPlatform({
      appKey: dingtalkAppKey,
      appSecret: config.get('dingtalkAppSecret')!,
      agentId: config.get('dingtalkAgentId'),
      oauthOrgId,
      oauthBaseUrl: config.get('oauthBaseUrl'),
      fetchImpl,
    })
    thirdParty = { platform }
    platformRoutes = buildPlatformRoutes(platform)
  }

  // ── 层级 4：storage（STORAGE_BACKEND != none 即启用）──
  const storage = overrides.storage ?? (await buildStorage(config))

  // ── 层级 5：license（GENUINE_SERVER 配置即启用）──
  let license: LicenseInject | false = false
  let licenseClient: import('@homurajs/license').LicenseClient | undefined
  if (genuineServer) {
    const built = await buildLicense(config, dbBundle.db, {
      server: genuineServer,
      fetchImpl,
      logger,
    })
    license = built.inject
    licenseClient = built.client
  }

  // ── 业务路由汇总 ──
  const routes = new Hono()
  routes.route('/api', buildApiRoutes(todoRepo))
  if (storage) routes.route('/', buildFileRoutes(storage))
  if (platformRoutes) routes.route('/api/platform', platformRoutes)
  // 中央激活用例：requireFeature 功能范围闸门示范（层级 5，配了 GENUINE_SERVER 才挂）
  if (licenseClient) routes.route('/api/license-demo', buildLicenseDemoRoutes(licenseClient, todoRepo))

  // 授权状态端点：在 guard 的豁免清单里，故 enforcement=all 时仍可读——
  // 否则前端连"为什么全站 503"都问不到，"每次使用强提醒"就无从展示。
  if (licenseClient) {
    const { LICENSE_STATUS_PATH } = await import('@homurajs/license/hono')
    const lc = licenseClient
    routes.get(LICENSE_STATUS_PATH, (c) =>
      c.json({
        status: lc.getStatus(),
        enforcement: lc.getEnforcement(),
        notice: lc.getNotice(),
        expiresAt: lc.getEntitlement()?.expiresAt ?? null,
        features: lc.getEntitlement()?.features ?? [],
        signature: lc.getSignatureState(),
      }),
    )
  }

  // ── 健康检查（生产可把 db check 换成真实 SELECT 1）──
  const checks: HealthCheck[] = [{ name: 'db', check: () => true }]

  // ── 组装 ──
  const { app, healthzPath } = createApp({
    routes,
    auth,
    thirdParty,
    license,
    staticDir: overrides.staticDir,
    logger,
    healthz: { checks },
  })

  const deps: BuiltApp['deps'] = {}
  deps.db = dbBundle.db as unknown as Record<string, unknown>
  if (storage) deps.storage = storage as unknown as NonNullable<AppDeps['storage']>
  if (thirdParty) deps.platform = thirdParty.platform
  if (licenseClient) deps.license = licenseClient as unknown as NonNullable<AppDeps['license']>
  deps.dbBundle = dbBundle
  deps.todoRepo = todoRepo

  return {
    app,
    healthzPath,
    deps,
    onStart: licenseClient
      ? async () => {
          // ⚠ 注册失败**不能让 App 起不来**：ADR-011 的 fail-open 必须覆盖启动期，
          // 否则授权中心在 App 启动那一刻不可达（或返回 4xx）就等于全站宕机。
          // 失败时状态停在 'unknown'，守卫按 fail-open 放行（strict 模式才 503），
          // 心跳循环会继续尝试；同时把原因打进日志与 /_license 端点。
          try {
            await licenseClient!.register()
          } catch (err) {
            logger?.warn('license 注册失败，按 fail-open 继续启动（心跳会重试）', {
              err: (err as Error).message,
              impact: '状态为 unknown，功能范围不可用（requireFeature 一律 403）',
            })
          }
          licenseClient!.startHeartbeat({
            onError: (e) => logger?.warn('license heartbeat error', { err: e.message }),
          })
        }
      : undefined,
    onStop: licenseClient ? () => licenseClient!.stop() : undefined,
  }
}

// ── 能力构建器（按 config 造真实实例）──

async function buildAuth(
  config: AppConfig,
  db: Parameters<typeof buildTodoRepo>[0],
  fetchImpl?: typeof fetch,
  secureCookies = false,
  logger?: Logger,
) {
  const {
    OidcClient,
    SessionManager,
    createDrizzleSessionStore,
    createDrizzleUserStore,
    createDrizzleOAuth2LinkStore,
    createDefaultIdentityResolver,
    PasswordProvider,
    createDrizzlePasswordStore,
  } = await import('@homurajs/auth')
  const { sessionMiddleware, createAuthRoutes } = await import('@homurajs/auth/hono')

  // OAuth state KV：内存版（ADR-010：单实例足够，多实例可换 createDbTtlKv）
  const stateKv = (await import('@homurajs/core')).createMemoryTtlKv()

  const sessions = new SessionManager(
    { secret: config.get('sessionSecret') },
    createDrizzleSessionStore(db),
  )

  // 多凭证身份：user store + identity link store + password store（共享）
  const userStore = createDrizzleUserStore(db)
  const linkStore = createDrizzleOAuth2LinkStore(db)

  // Password provider（如果启用）：通过 PasswordStore 接口操作，不直接依赖数据库实例
  const passwordEnabled = config.get('authPasswordEnabled')
  const password = passwordEnabled
    ? new PasswordProvider({ userStore, passwordStore: createDrizzlePasswordStore(db) })
    : undefined

  // OIDC client（如果配置了钉钉 IdP）
  const oauthOrgId = config.get('oauthOrgId')
  let client: InstanceType<typeof OidcClient> | undefined
  let identityResolver: ReturnType<typeof createDefaultIdentityResolver> | undefined
  if (oauthOrgId) {
    const { dingtalkOidc } = await import('@homurajs/3p/dingtalk')
    const preset = dingtalkOidc({ orgId: oauthOrgId, baseUrl: config.get('oauthBaseUrl') })
    client = new OidcClient({
      clientId: config.get('oauthClientId') ?? '',
      clientSecret: config.get('oauthClientSecret') ?? '',
      redirectUri: config.get('oauthRedirectUri') ?? '',
      scopes: ['openid'],
      stateKv,
      fetchImpl,
      ...preset,
    })
    // Identity resolver：JIT 默认开启，OIDC 首次登录自动建户
    identityResolver = createDefaultIdentityResolver(userStore, linkStore, {
      jit: config.get('authOidcJit'),
    })
  }

  // WebAuthn provider（如果启用且配齐 rpId/origin）。
  // ⚠ challenge 复用 stateKv（与 OIDC state 同机制）；
  //   @simplewebauthn/server 是 optional peer，provider 内部动态 import，未装也不影响挂载，
  //   只有真正调用 WebAuthn 端点时才需要该依赖。客户端 passkey UI 由 App 自绘（SDK 只给 JSON 路由）。
  const webauthnEnabled = config.get('authWebauthnEnabled')
  const webauthnRpId = config.get('authWebauthnRpId')
  const webauthnOrigin = config.get('authWebauthnOrigin')
  let webauthnRoutes: Hono | undefined
  if (webauthnEnabled) {
    if (!webauthnRpId || !webauthnOrigin) {
      logger?.warn(
        'AUTH_WEBAUTHN_ENABLED=true 但缺 AUTH_WEBAUTHN_RP_ID / AUTH_WEBAUTHN_ORIGIN，WebAuthn 路由未挂载',
        { impact: 'Passkey 注册/登录不可用；补齐两项配置后重启' },
      )
    } else {
      const { WebAuthProvider, createWebAuthnRoutes, createDrizzleWebauthnCredentialStore } =
        await import('@homurajs/auth/webauthn')
      const webauthn = new WebAuthProvider({
        rpId: webauthnRpId,
        rpName: config.get('authWebauthnRpName') ?? webauthnRpId,
        // 多 origin 用逗号分隔（env.ts 约定）
        origin: webauthnOrigin
          .split(',')
          .map((s) => s.trim())
          .filter((s) => s !== ''),
        credentialStore: createDrizzleWebauthnCredentialStore(db),
        userStore,
        challengeKv: stateKv,
      })
      webauthnRoutes = createWebAuthnRoutes({ webauthn, sessions, secure: secureCookies })
    }
  }

  // 组合 auth 路由：createAuthRoutes 装 OIDC + Password + refresh/logout，
  // WebAuthn 路由是独立子路径，route() 进同一个 authRoutes（AuthInject 契约不变）。
  const authRoutes = createAuthRoutes({
    sessions,
    oidc: client && identityResolver ? { client, identityResolver, provider: 'dingtalk' } : undefined,
    password,
    // 自助注册开关（此前定义了却没传，恒取缺省 true → "仅管理员建户"模式不可达）
    allowRegister: config.get('authPasswordAllowSelfRegister'),
    secure: secureCookies,
  })
  if (webauthnRoutes) authRoutes.route('/', webauthnRoutes)

  return {
    sessions: sessions as unknown as AuthInject['sessions'],
    sessionMiddleware: sessionMiddleware(sessions, { secure: secureCookies }),
    authRoutes,
  } satisfies AuthInject
}

async function buildStorage(config: AppConfig): Promise<FileStorage | undefined> {
  const backend = config.get('storageBackend')
  if (backend === 'none') return undefined
  if (backend === 'local') {
    const { createLocalStorage } = await import('@homurajs/storage/local')
    return createLocalStorage({ rootDir: config.get('localStorageDir') })
  }
  if (backend === 's3') {
    const { createS3Storage } = await import('@homurajs/storage/s3')
    return createS3Storage({
      endpoint: config.get('s3Endpoint')!,
      region: config.get('s3Region'),
      bucket: config.get('s3Bucket')!,
      accessKeyId: config.get('s3AccessKey')!,
      secretAccessKey: config.get('s3SecretKey')!,
      // ⚠ 阿里云 OSS 必须 false（virtual-hosted）；minio 用缺省 true（path-style）
      forcePathStyle: config.get('s3ForcePathStyle'),
    })
  }
  if (backend === 'supabase') {
    const { createSupabaseStorage, loadSupabaseStorageEnv } =
      await import('@homurajs/storage/supabase')
    // 只读 SUPABASE_URL + SUPABASE_ANON_KEY（平台形态自动注入；独立部署自行设置）
    const { platformUrl, apiKey } = loadSupabaseStorageEnv(process.env)
    // ⚠ bucket 必须预先存在（anon 无建桶权）
    return createSupabaseStorage({ platformUrl, apiKey, bucket: config.get('supabaseBucket') })
  }
  return undefined
}

async function buildLicense(
  config: AppConfig,
  db: Parameters<typeof buildTodoRepo>[0],
  opts: { server: string; fetchImpl?: typeof fetch; logger?: Logger },
) {
  const { LicenseClient, createDrizzleStateStore } = await import('@homurajs/license')
  const { licenseGuard } = await import('@homurajs/license/hono')
  const stateStore = createDrizzleStateStore(db)
  const publicKey = config.get('genuinePublicKey')
  if (!publicKey) {
    // 不验签 = 中心响应可被中间人改成 active。开发期方便，生产必须配。
    opts.logger?.warn('未配置 GENUINE_PUBLIC_KEY：授权响应不验签，生产环境必须配置', {
      impact: '中间人可伪造 active 状态绕过到期与停服',
    })
  }
  const client = new LicenseClient({
    server: opts.server,
    productId: config.get('genuineProductId') ?? 'template',
    appId: config.get('genuineAppId') ?? 'template-app',
    licenseKey: config.get('genuineLicenseKey'),
    stateStore,
    fetchImpl: opts.fetchImpl,
    publicKey,
  })
  const corePaths = (config.get('genuineCorePaths') ?? '/api')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s !== '')
  return {
    client,
    inject: {
      client: client as unknown as LicenseInject['client'],
      // 豁免清单与 createApp 注册的健康检查路径同源
      guard: licenseGuard(client, { corePaths }),
    } satisfies LicenseInject,
  }
}
