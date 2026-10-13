/**
 * buildApp：渐进式装配核心（活文档）。
 *
 * 纯函数式组装——从 AppConfig 读出「启用了哪些能力」，逐级注入 createApp：
 *   层级 0：纯 routes + 健康检查（永远可跑；路径按形态取，qw-pages 让开网关保留的 /healthz）
 *   层级 1：db（DIALECT，缺省按形态：standalone→sqlite / qw-pages→rest）→ todos repository
 *   层级 2：auth（OAUTH_DINGTALK_ORG_ID）→ 登录链（**仅 SQL 形态**，见下方说明）
 *   层级 3：3p（DINGTALK_APP_KEY）→ 平台能力协商
 *   层级 4：storage（STORAGE_BACKEND）→ 上传/下载
 *   层级 5：license（GENUINE_SERVER）→ 激活守卫（**仅 SQL 形态**）
 *
 * e2e 测试通过 overrides 注入桩实例（db/fetch），走真实装配路径。
 *
 * ⚠ REST 形态（qw-pages）的能力缺口：@homurajs/auth 的 session store 与 @homurajs/license
 * 的 state store 目前只有 drizzle 实现，REST 侧没有对应实现，故这两层在 dialect=rest 时
 * **不启用**并打 warn，而不是静默降级或运行时崩。补齐需要 createRestSessionStore /
 * createRestStateStore（表结构与 SQL 版一致，走 PostgREST upsert + delete-returning）。
 */
import { Hono } from 'hono'
import {
  createApp,
  type AppDeps,
  type AuthInject,
  type HealthCheck,
  type LicenseInject,
} from '@homurajs/app-kit'
import { detectRuntime, healthzPathFor, type Logger, type RuntimeInfo } from '@homurajs/core'
import type { Database } from '@homurajs/db'
import type { FileStorage } from '@homurajs/storage'
import { resolveDialect, type AppConfig } from './env.js'
import { buildDb, migrate, type DbBundle } from './db.js'
import { buildRestTodoRepo, buildTodoRepo, type TodoRepo } from './todos-repo.js'
import { todosRest } from './schema/rest.js'
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
  /** 跳过迁移/探活（e2e 用原生 DDL 建表时） */
  skipMigrate?: boolean
  /**
   * cookie 是否置 Secure。入口层传 adapter.trustProxy()：
   * qw-pages 在平台网关后（公网 https）恒为 true；standalone 由 TRUST_PROXY=1 决定。
   * 旧实现从不传，导致 Pages 上 https 站点发的是非 Secure cookie。
   */
  secureCookies?: boolean
}

export interface BuiltApp {
  app: Hono
  runtime: RuntimeInfo
  /** 实际注册的健康检查路径（与 license guard 豁免清单同源） */
  healthzPath: string
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
  const runtimeTarget = detectRuntime(process.env).target
  const healthzPath = healthzPathFor(runtimeTarget)
  const secureCookies = overrides.secureCookies ?? false

  // ── 层级 1：db（sqlite / pg / rest）──
  const dialect = resolveDialect(config)
  const dbBundle: DbBundle = overrides.db ?? (await buildDb(config, dialect))
  // SQL 形态跑 drizzle 迁移；REST 形态无 DDL 权限 → 探活校验（表与 policy 由平台受控迁移建）
  if (!overrides.skipMigrate) {
    await migrate(dbBundle, [todosRest.table])
  }
  const todoRepo: TodoRepo =
    dbBundle.kind === 'sql'
      ? buildTodoRepo(dbBundle.db, dbBundle.dialect)
      : buildRestTodoRepo(dbBundle.rest)

  // ── 层级 2：auth（OAUTH_DINGTALK_ORG_ID 配置即启用；仅 SQL 形态）──
  let auth: AuthInject | false = false
  const oauthOrgId = config.get('oauthOrgId')
  if (oauthOrgId && dbBundle.kind === 'sql') {
    auth = await buildAuth(config, dbBundle.db, oauthOrgId, fetchImpl, secureCookies)
  } else if (oauthOrgId) {
    logger?.warn('auth 未启用：dialect=rest 尚无 REST 版 session store', {
      dialect,
      missing: 'createRestSessionStore',
      impact: '登录链不可用；补齐前 qw-pages 形态请只做匿名业务',
    })
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

  // ── 层级 5：license（GENUINE_SERVER 配置即启用；仅 SQL 形态）──
  let license: LicenseInject | false = false
  let licenseClient: import('@homurajs/license').LicenseClient | undefined
  const genuineServer = config.get('genuineServer')
  if (genuineServer && dbBundle.kind === 'sql') {
    const built = await buildLicense(config, dbBundle.db, genuineServer, healthzPath, fetchImpl)
    license = built.inject
    licenseClient = built.client
  } else if (genuineServer) {
    logger?.warn('license 未启用：dialect=rest 尚无 REST 版 state store', {
      dialect,
      missing: 'createRestStateStore',
      impact: '激活状态无法持久化，停服守卫不生效',
    })
  }

  // ── 业务路由汇总 ──
  const routes = new Hono()
  routes.route('/api', buildApiRoutes(todoRepo))
  if (storage) routes.route('/', buildFileRoutes(storage))
  if (platformRoutes) routes.route('/api/platform', platformRoutes)

  // ── 健康检查：REST 形态做真探活（能查出「表没建 / policy 没给」这类静默失败）──
  const bundle = dbBundle
  const checks: HealthCheck[] = [
    {
      name: 'db',
      check: async () => {
        if (bundle.kind === 'sql') return true // 能建出来即视为健康；生产可替换为 SELECT 1
        await bundle.rest.ping(todosRest.table)
        return true
      },
    },
  ]

  // ── 组装 ──
  const { app, runtime } = createApp({
    routes,
    auth,
    thirdParty,
    license,
    staticDir: overrides.staticDir,
    logger,
    healthz: { path: healthzPath, checks },
  })

  const deps: BuiltApp['deps'] = {}
  deps.db = (bundle.kind === 'sql' ? bundle.db : bundle.rest) as unknown as Record<string, unknown>
  if (storage) deps.storage = storage as unknown as NonNullable<AppDeps['storage']>
  if (thirdParty) deps.platform = thirdParty.platform
  if (licenseClient) deps.license = licenseClient as unknown as NonNullable<AppDeps['license']>
  deps.dbBundle = bundle
  deps.todoRepo = todoRepo

  return {
    app,
    runtime,
    healthzPath,
    deps,
    onStart: licenseClient
      ? async () => {
          await licenseClient!.register()
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
  db: Database,
  oauthOrgId: string,
  fetchImpl?: typeof fetch,
  secureCookies = false,
) {
  const { OAuth2Client, SessionManager, createDrizzleSessionStore } = await import('@homurajs/auth')
  const { sessionMiddleware, createAuthRoutes } = await import('@homurajs/auth/hono')
  const { dingtalkOAuth } = await import('@homurajs/3p/dingtalk')
  const { createMemoryTtlKv } = await import('@homurajs/core')

  const preset = dingtalkOAuth({ orgId: oauthOrgId, baseUrl: config.get('oauthBaseUrl') })
  const client = new OAuth2Client({
    clientId: config.get('oauthClientId') ?? '',
    clientSecret: config.get('oauthClientSecret') ?? '',
    redirectUri: config.get('oauthRedirectUri') ?? '',
    scopes: ['openid'],
    // ⚠ OAuth state 用内存 KV：qw-pages 上进程重启即失效（跨发布必换实例）。
    // 多实例/重发布敏感场景应换 createDbTtlKv（SQL 形态）或 createRestTtlKv（REST 形态）。
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
    sessionMiddleware: sessionMiddleware(sessions, { secure: secureCookies }),
    authRoutes: createAuthRoutes({ client, sessions, secure: secureCookies }),
  } satisfies AuthInject
}

async function buildStorage(config: AppConfig): Promise<FileStorage | undefined> {
  const backend = config.get('storageBackend')
  if (backend === 'none') return undefined
  if (backend === 'local') {
    const { createLocalStorage } = await import('@homurajs/storage/local')
    // ⚠ qw-pages 上本地目录不持久：应用根只读，QWENWORK_WRITABLE_DIR 跨发布清空。
    // 只适合当临时缓冲，别当图床。
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
    })
  }
  if (backend === 'supabase') {
    const { createSupabaseStorage, loadSupabaseStorageEnv } =
      await import('@homurajs/storage/supabase')
    // 只读 SUPABASE_URL + SUPABASE_ANON_KEY（qw-pages 自动注入）；
    // 不再复用 db/pg 的 loadSupabaseEnv——那个要 PROJECT_REF+DB_PASSWORD，Pages 不下发。
    const { platformUrl, apiKey } = loadSupabaseStorageEnv(process.env)
    // ⚠ bucket 必须预先存在：Pages 上 anon 无建桶权（实测 403 RLS），
    // 受控迁移角色对 storage schema 也无权（实测 42501）→ 部署期同样建不出桶。
    return createSupabaseStorage({ platformUrl, apiKey, bucket: config.get('supabaseBucket') })
  }
  return undefined
}

async function buildLicense(
  config: AppConfig,
  db: Database,
  server: string,
  healthzPath: string,
  fetchImpl?: typeof fetch,
) {
  const { LicenseClient, createDrizzleStateStore } = await import('@homurajs/license')
  const { licenseGuard } = await import('@homurajs/license/hono')
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
      // 豁免清单与 createApp 注册的健康检查路径同源（qw-pages 上是 /_healthz）
      guard: licenseGuard(client, { healthzPath }),
    } satisfies LicenseInject,
  }
}
