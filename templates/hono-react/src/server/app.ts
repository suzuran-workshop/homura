/**
 * buildApp：渐进式装配核心（活文档）。
 *
 * 纯函数式组装——从 AppConfig 读出「启用了哪些能力」，逐级注入 createApp：
 *   层级 0：纯 routes + /healthz（永远可跑）
 *   层级 1：db（DIALECT）→ todos repository
 *   层级 2：auth（OAUTH_DINGTALK_ORG_ID）→ 登录链
 *   层级 3：3p（DINGTALK_APP_KEY）→ 平台能力协商
 *   层级 4：storage（STORAGE_BACKEND）→ 上传/下载
 *   层级 5：license（GENUINE_SERVER）→ 激活守卫
 *
 * e2e 测试通过 overrides 注入桩实例（db/fetch），走真实装配路径。
 */
import { Hono } from 'hono'
import { createApp, type AppDeps, type AuthInject, type LicenseInject } from '@homura/app-kit'
import type { Logger } from '@homura/core'
import type { Database } from '@homura/db'
import type { FileStorage } from '@homura/storage'
import type { AppConfig } from './env.js'
import { buildDb, migrate, type DbBundle } from './db.js'
import { buildTodoRepo, type TodoRepo } from './todos-repo.js'
import { buildApiRoutes } from './routes/api.js'
import { buildFileRoutes } from './routes/files.js'
import { buildPlatformRoutes } from './routes/platform.js'

export interface BuildAppOverrides {
  /** 注入已建好的 db（e2e 用 :memory:）；不传则按 config 建 */
  db?: DbBundle
  /** 注入 storage（e2e 用 local tmpdir）；不传则按 config 建 */
  storage?: FileStorage
  /** 注入 fetch（e2e 桩 OAuth/genuine） */
  fetchImpl?: typeof fetch
  logger?: Logger
  /** 静态资源目录（standalone/qw-pages adapter 传入） */
  staticDir?: string
  /** 跳过迁移（e2e 用原生 DDL 建表时） */
  skipMigrate?: boolean
}

export interface BuiltApp {
  app: Hono
  runtime: { target: string }
  /** 供入口层启动后使用（license 心跳、db 关闭等） */
  deps: AppDeps & { dbBundle?: DbBundle; todoRepo?: TodoRepo }
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

  // ── 层级 1：db（可选）──
  let dbBundle = overrides.db
  let todoRepo: TodoRepo | undefined
  if (!dbBundle && config.get('dialect')) {
    // dialect 有默认值 'sqlite'，恒启用 db（模板的核心能力）
    dbBundle = await buildDb(config)
  }
  if (dbBundle && !overrides.skipMigrate) {
    await migrate(dbBundle)
  }
  if (dbBundle) {
    todoRepo = buildTodoRepo(dbBundle.db, dbBundle.dialect)
  }

  // ── 层级 2：auth（OAUTH_DINGTALK_ORG_ID 配置即启用）──
  let auth: AuthInject | false = false
  const oauthOrgId = config.get('oauthOrgId')
  if (oauthOrgId && dbBundle) {
    auth = await buildAuth(config, dbBundle.db, oauthOrgId, fetchImpl)
  }

  // ── 层级 3：3p 平台（DINGTALK_APP_KEY 配置即启用）──
  let thirdParty: { platform: import('@homura/app-kit').PlatformLike } | undefined
  let platformRoutes: Hono | undefined
  const dingtalkAppKey = config.get('dingtalkAppKey')
  if (dingtalkAppKey && config.get('dingtalkAppSecret')) {
    const { createDingtalkPlatform } = await import('@homura/3p/dingtalk')
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
  let storage = overrides.storage
  if (!storage) {
    storage = await buildStorage(config)
  }

  // ── 层级 5：license（GENUINE_SERVER 配置即启用）──
  let license: LicenseInject | false = false
  let licenseClient: import('@homura/license').LicenseClient | undefined
  const genuineServer = config.get('genuineServer')
  if (genuineServer && dbBundle) {
    const built = await buildLicense(config, dbBundle.db, genuineServer, fetchImpl)
    license = built.inject
    licenseClient = built.client
  }

  // ── 业务路由汇总 ──
  const routes = new Hono()
  if (todoRepo) routes.route('/api', buildApiRoutes(todoRepo))
  else routes.get('/api/me', (c) => c.json({ user: null })) // 无 db 降级
  if (storage) routes.route('/', buildFileRoutes(storage))
  if (platformRoutes) routes.route('/api/platform', platformRoutes)

  // ── 组装 ──
  const { app, runtime } = createApp({
    routes,
    auth,
    thirdParty,
    license,
    staticDir: overrides.staticDir,
    logger,
    // db 能建出来即视为健康；生产可替换为真实 ping（SELECT 1）
    healthz: { checks: dbBundle ? [{ name: 'db', check: () => true }] : [] },
  })

  const deps: BuiltApp['deps'] = {}
  if (dbBundle) deps.db = dbBundle.db as unknown as Record<string, unknown>
  if (storage) deps.storage = storage as unknown as NonNullable<AppDeps['storage']>
  if (thirdParty) deps.platform = thirdParty.platform
  if (licenseClient) deps.license = licenseClient as unknown as NonNullable<AppDeps['license']>
  deps.dbBundle = dbBundle
  deps.todoRepo = todoRepo

  return {
    app,
    runtime,
    deps,
    onStart: licenseClient
      ? async () => {
          await licenseClient!.register()
          licenseClient!.startHeartbeat({ onError: (e) => logger?.warn('license heartbeat error', { err: e.message }) })
        }
      : undefined,
    onStop: licenseClient ? () => licenseClient!.stop() : undefined,
  }
}

// ── 能力构建器（按 config 造真实实例）──

async function buildAuth(
  config: AppConfig,
  db: Database,
  oauthOrgId: string,
  fetchImpl?: typeof fetch,
) {
  const { OAuth2Client, SessionManager, createDrizzleSessionStore } = await import('@homura/auth')
  const { sessionMiddleware, createAuthRoutes } = await import('@homura/auth/hono')
  const { dingtalkOAuth } = await import('@homura/3p/dingtalk')
  const { createMemoryTtlKv } = await import('@homura/core')

  const preset = dingtalkOAuth({ orgId: oauthOrgId, baseUrl: config.get('oauthBaseUrl') })
  const client = new OAuth2Client({
    clientId: config.get('oauthClientId') ?? '',
    clientSecret: config.get('oauthClientSecret') ?? '',
    redirectUri: config.get('oauthRedirectUri') ?? '',
    scopes: ['openid'],
    stateKv: createMemoryTtlKv(),
    fetchImpl,
    ...preset,
  })
  const sessions = new SessionManager(
    { secret: config.get('sessionSecret') },
    createDrizzleSessionStore(db),
  )
  return {
    sessions: sessions as unknown as AuthInject['sessions'],
    sessionMiddleware: sessionMiddleware(sessions),
    authRoutes: createAuthRoutes({ client, sessions }),
  } satisfies AuthInject
}

async function buildStorage(config: AppConfig): Promise<FileStorage | undefined> {
  const backend = config.get('storageBackend')
  if (backend === 'none') return undefined
  if (backend === 'local') {
    const { createLocalStorage } = await import('@homura/storage/local')
    return createLocalStorage({ rootDir: config.get('localStorageDir') })
  }
  if (backend === 's3') {
    const { createS3Storage } = await import('@homura/storage/s3')
    return createS3Storage({
      endpoint: config.get('s3Endpoint')!,
      region: config.get('s3Region'),
      bucket: config.get('s3Bucket')!,
      accessKeyId: config.get('s3AccessKey')!,
      secretAccessKey: config.get('s3SecretKey')!,
    })
  }
  if (backend === 'supabase') {
    const { createSupabaseStorage } = await import('@homura/storage/supabase')
    const { loadSupabaseEnv } = await import('@homura/db/pg')
    const { platformUrl, anonKey } = loadSupabaseEnv(process.env)
    return createSupabaseStorage({ platformUrl, apiKey: anonKey, bucket: 'files' })
  }
  return undefined
}

async function buildLicense(
  config: AppConfig,
  db: Database,
  server: string,
  fetchImpl?: typeof fetch,
) {
  const { LicenseClient, createDrizzleStateStore } = await import('@homura/license')
  const { licenseGuard } = await import('@homura/license/hono')
  const client = new LicenseClient({
    server,
    productId: config.get('genuineProductId') ?? 'template',
    appId: config.get('genuineAppId') ?? 'template-app',
    licenseKey: config.get('genuineLicenseKey'),
    stateStore: createDrizzleStateStore(db),
    fetchImpl,
  })
  return {
    client,
    inject: {
      client: client as unknown as LicenseInject['client'],
      guard: licenseGuard(client),
    } satisfies LicenseInject,
  }
}
