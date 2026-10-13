/**
 * buildApp：渐进式装配核心（活文档）。
 *
 * 纯函数式组装——从 AppConfig 读出「启用了哪些能力」，逐级注入 createApp：
 *   层级 0：纯 routes + 健康检查（永远可跑；路径按形态取，qw-pages 让开网关保留的 /healthz）
 *   层级 1：db（DIALECT，缺省按形态：standalone→sqlite / qw-pages→rest）→ todos repository
 *   层级 2：auth（OAUTH_DINGTALK_ORG_ID）→ 登录链（SQL 与 REST 形态均支持）
 *   层级 3：3p（DINGTALK_APP_KEY）→ 平台能力协商
 *   层级 4：storage（STORAGE_BACKEND）→ 上传/下载
 *   层级 5：license（GENUINE_SERVER）→ 激活守卫（SQL 与 REST 形态均支持）
 *
 * e2e 测试通过 overrides 注入桩实例（db/fetch），走真实装配路径。
 *
 * 形态差异全部收在 store/repo 的选择上：todos repository、auth 的 session store、
 * license 的 state store 各有 SQL 与 REST 两套实现，接口语义严格对齐（REST 版的「原子抢占」
 * 用 PATCH + 过滤 + return=representation 表达，等价于 UPDATE...WHERE...RETURNING）。
 *
 * ⚠ REST 形态的表必须预先存在（App 无 DDL 权限）：todos / refresh_tokens / license_state /
 * homura_ttlkv 四张表 + anon 的 RLS policy，由部署期的平台受控迁移执行 drizzle/pg 的
 * 迁移 SQL 创建。缺 policy 时 PostgREST 是静默失败（SELECT 返回 200 空数组，INSERT 返回 401）。
 * ⚠ 对象存储在 qw-pages 上不可用（anon 与受控迁移角色都建不出桶），见 docs/specs/module-qw-pages.md。
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
import { REST_TTLKV_TABLE } from '@homurajs/db'
import type { FileStorage } from '@homurajs/storage'
import { resolveDialect, type AppConfig } from './env.js'
import { buildDb, migrate, type DbBundle } from './db.js'
import { buildRestTodoRepo, buildTodoRepo, type TodoRepo } from './todos-repo.js'
import { licenseStateRest, refreshTokensRest, restBusinessTables } from './schema/rest.js'
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
  const oauthOrgId = config.get('oauthOrgId')
  const genuineServer = config.get('genuineServer')

  /**
   * 本 App 实际需要的表 = 业务表（schema/rest.ts 的 restBusinessTables）+ 按启用的能力追加。
   *
   * REST 形态下缺表 / 缺 policy 是**静默失败**（SELECT 返回 200 空数组、INSERT 返回 401+42501），
   * 所以这份清单同时用于「部署期探活」与「/_healthz 的 db 检查」。
   * 新增业务表只需在 restBusinessTables 登记一次，两处自动覆盖——别再往这里塞硬编码表名。
   */
  const requiredTables: string[] = [
    ...restBusinessTables.map((t) => t.table),
    ...(oauthOrgId ? [refreshTokensRest.table, REST_TTLKV_TABLE] : []),
    ...(genuineServer ? [licenseStateRest.table] : []),
  ]

  const dbBundle: DbBundle = overrides.db ?? (await buildDb(config, dialect))
  // SQL 形态跑 drizzle 迁移；REST 形态无 DDL 权限 → 探活校验（表与 policy 由平台受控迁移建）
  if (!overrides.skipMigrate) {
    await migrate(dbBundle, requiredTables)
  }
  const todoRepo: TodoRepo =
    dbBundle.kind === 'sql'
      ? buildTodoRepo(dbBundle.db, dbBundle.dialect)
      : buildRestTodoRepo(dbBundle.rest)

  // ── 层级 2：auth（OAUTH_DINGTALK_ORG_ID 配置即启用；SQL 与 REST 形态均支持）──
  let auth: AuthInject | false = false
  if (oauthOrgId) {
    auth = await buildAuth(config, dbBundle, oauthOrgId, fetchImpl, secureCookies)
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

  // ── 层级 5：license（GENUINE_SERVER 配置即启用；SQL 与 REST 形态均支持）──
  let license: LicenseInject | false = false
  let licenseClient: import('@homurajs/license').LicenseClient | undefined
  if (genuineServer) {
    const built = await buildLicense(config, dbBundle, genuineServer, healthzPath, fetchImpl)
    license = built.inject
    licenseClient = built.client
  }

  // ── 业务路由汇总 ──
  const routes = new Hono()
  routes.route('/api', buildApiRoutes(todoRepo))
  if (storage) routes.route('/', buildFileRoutes(storage))
  if (platformRoutes) routes.route('/api/platform', platformRoutes)

  // ── 健康检查：REST 形态逐表真探活（能查出「表没建 / policy 没给」这类静默失败）──
  const bundle = dbBundle
  const checks: HealthCheck[] = [
    {
      name: 'db',
      check: async () => {
        if (bundle.kind === 'sql') return true // 能建出来即视为健康；生产可替换为 SELECT 1
        for (const table of requiredTables) await bundle.rest.ping(table)
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
  bundle: DbBundle,
  oauthOrgId: string,
  fetchImpl?: typeof fetch,
  secureCookies = false,
) {
  const { OAuth2Client, SessionManager, createDrizzleSessionStore, createRestSessionStore } =
    await import('@homurajs/auth')
  const { sessionMiddleware, createAuthRoutes } = await import('@homurajs/auth/hono')
  const { dingtalkOAuth } = await import('@homurajs/3p/dingtalk')

  // OAuth state KV：REST 形态用 DB 版（内存 KV 在 Pages 上进程重启即清空，
  // 登录会断在「跳转 → 回调」两条腿之间）；SQL 形态沿用内存版（ADR-010：单实例足够，
  // 多实例可换 createDbTtlKv）。REST 版需要 homura_ttlkv 表（部署期受控迁移创建）。
  const stateKv =
    bundle.kind === 'rest'
      ? (await import('@homurajs/db')).createRestTtlKv(bundle.rest)
      : (await import('@homurajs/core')).createMemoryTtlKv()

  const preset = dingtalkOAuth({ orgId: oauthOrgId, baseUrl: config.get('oauthBaseUrl') })
  const client = new OAuth2Client({
    clientId: config.get('oauthClientId') ?? '',
    clientSecret: config.get('oauthClientSecret') ?? '',
    redirectUri: config.get('oauthRedirectUri') ?? '',
    scopes: ['openid'],
    stateKv,
    fetchImpl,
    ...preset,
  })
  // session store 按形态选实现：两套接口语义严格对齐（含 consume 的原子抢占与复用检出）
  const store =
    bundle.kind === 'sql'
      ? createDrizzleSessionStore(bundle.db)
      : createRestSessionStore(bundle.rest)
  const sessions = new SessionManager({ secret: config.get('sessionSecret') }, store)
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
  bundle: DbBundle,
  server: string,
  healthzPath: string,
  fetchImpl?: typeof fetch,
) {
  const { LicenseClient, createDrizzleStateStore, createRestStateStore } =
    await import('@homurajs/license')
  const { licenseGuard } = await import('@homurajs/license/hono')
  // state store 按形态选实现；REST 版不建表（无 DDL 权限），license_state 须由受控迁移预建
  const stateStore =
    bundle.kind === 'sql' ? createDrizzleStateStore(bundle.db) : createRestStateStore(bundle.rest)
  const client = new LicenseClient({
    server,
    productId: config.get('genuineProductId') ?? 'template',
    appId: config.get('genuineAppId') ?? 'template-app',
    licenseKey: config.get('genuineLicenseKey'),
    stateStore,
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
