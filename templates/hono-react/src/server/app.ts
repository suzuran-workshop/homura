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
import { licenseStateRest, refreshTokensRest, homuraFilesRest, homuraFileChunksRest, usersRest, passwordsRest, oauth2IdentityLinksRest, webauthnCredentialsRest, restBusinessTables } from './schema/rest.js'
import { buildApiRoutes } from './routes/api.js'
import { buildFileRoutes } from './routes/files.js'
import { buildPlatformRoutes } from './routes/platform.js'
import { buildLicenseDemoRoutes } from './routes/license-demo.js'

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
  const storageBackend = config.get('storageBackend')
  // 认证能力开关（渐进式：配了啥才启用啥，各能力独立 opt-in；密码/WebAuthn 缺省关，OAuth2 靠 oauthOrgId）
  const authPasswordEnabled = config.get('authPasswordEnabled')
  const authWebauthnEnabled = config.get('authWebauthnEnabled')
  const anyAuth = Boolean(oauthOrgId) || authPasswordEnabled || authWebauthnEnabled

  /**
   * 本 App 实际需要的表 = 业务表（schema/rest.ts 的 restBusinessTables）+ 按**实际启用的能力**逐张追加。
   *
   * REST 形态下缺表 / 缺 policy 是**静默失败**（SELECT 返回 200 空数组、INSERT 返回 401+42501），
   * 所以这份清单同时用于「部署期探活」与「/_healthz 的 db 检查」。
   * 新增业务表只需在 restBusinessTables 登记一次，两处自动覆盖——别再往这里塞硬编码表名。
   *
   * ⚠ 每张 auth 表精确映射到「真正需要它的能力」，别一刀切（配了啥才建啥）：
   *   - refresh_tokens（session）+ users（本地身份锚点）：任何认证形态都要
   *   - homura_ttlkv：OAuth2 state 与 WebAuthn challenge 用（纯密码认证不碰它）
   *   - oauth2_identity_links：仅 OAuth2；passwords：仅密码；webauthn_credentials：仅 WebAuthn
   *   旧实现把 refresh_tokens/ttlkv 只挂在 oauthOrgId、四张身份表只挂在 password||webauthn，
   *   导致「纯密码部署」漏 refresh_tokens（登录写 session 静默失败）、「纯 OAuth2 部署」漏
   *   users/oauth2_identity_links（JIT 建户静默失败）——都是 qw-pages 上的静默失败。
   */
  const requiredTables: string[] = [
    ...restBusinessTables.map((t) => t.table),
    ...(anyAuth ? [refreshTokensRest.table, usersRest.table] : []),
    ...(oauthOrgId || authWebauthnEnabled ? [REST_TTLKV_TABLE] : []),
    ...(oauthOrgId ? [oauth2IdentityLinksRest.table] : []),
    ...(authPasswordEnabled ? [passwordsRest.table] : []),
    ...(authWebauthnEnabled ? [webauthnCredentialsRest.table] : []),
    ...(genuineServer ? [licenseStateRest.table] : []),
    ...(storageBackend === 'db' ? [homuraFilesRest.table, homuraFileChunksRest.table] : []),
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

  // ── 层级 2：auth（OAuth2 / Password / WebAuthn 任一启用即挂载；SQL 与 REST 形态均支持）──
  let auth: AuthInject | false = false
  if (anyAuth) {
    auth = await buildAuth(config, dbBundle, fetchImpl, secureCookies, logger)
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
  const storage = overrides.storage ?? (await buildStorage(config, dbBundle))

  // ── 层级 5：license（GENUINE_SERVER 配置即启用；SQL 与 REST 形态均支持）──
  let license: LicenseInject | false = false
  let licenseClient: import('@homurajs/license').LicenseClient | undefined
  if (genuineServer) {
    const built = await buildLicense(config, dbBundle, {
      server: genuineServer,
      healthzPath,
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
  bundle: DbBundle,
  fetchImpl?: typeof fetch,
  secureCookies = false,
  logger?: Logger,
) {
  const {
    OAuth2Client,
    SessionManager,
    createDrizzleSessionStore,
    createRestSessionStore,
    createDrizzleUserStore,
    createRestUserStore,
    createDrizzleOAuth2LinkStore,
    createRestOAuth2LinkStore,
    createDefaultIdentityResolver,
    PasswordProvider,
    createDrizzlePasswordStore,
    createRestPasswordStore,
  } = await import('@homurajs/auth')
  const { sessionMiddleware, createAuthRoutes } = await import('@homurajs/auth/hono')

  // OAuth state KV：REST 形态用 DB 版（内存 KV 在 Pages 上进程重启即清空，
  // 登录会断在「跳转 → 回调」两条腿之间）；SQL 形态沿用内存版（ADR-010：单实例足够，
  // 多实例可换 createDbTtlKv）。REST 版需要 homura_ttlkv 表（部署期受控迁移创建）。
  const stateKv =
    bundle.kind === 'rest'
      ? (await import('@homurajs/db')).createRestTtlKv(bundle.rest)
      : (await import('@homurajs/core')).createMemoryTtlKv()

  // session store 按形态选实现：两套接口语义严格对齐（含 consume 的原子抢占与复用检出）
  const store =
    bundle.kind === 'sql'
      ? createDrizzleSessionStore(bundle.db)
      : createRestSessionStore(bundle.rest)
  const sessions = new SessionManager({ secret: config.get('sessionSecret') }, store)

  // 多凭证身份：user store + oauth2 link store + password store（共享）
  const userStore =
    bundle.kind === 'sql'
      ? createDrizzleUserStore(bundle.db)
      : createRestUserStore(bundle.rest)
  const linkStore =
    bundle.kind === 'sql'
      ? createDrizzleOAuth2LinkStore(bundle.db)
      : createRestOAuth2LinkStore(bundle.rest)

  // Password provider（如果启用）：通过 PasswordStore 接口操作，不直接依赖数据库实例
  const passwordEnabled = config.get('authPasswordEnabled')
  const password = passwordEnabled
    ? new PasswordProvider({
        userStore,
        passwordStore:
          bundle.kind === 'sql'
            ? createDrizzlePasswordStore(bundle.db)
            : createRestPasswordStore(bundle.rest),
      })
    : undefined

  // OAuth2 client（如果配置了钉钉）
  const oauthOrgId = config.get('oauthOrgId')
  let client: InstanceType<typeof OAuth2Client> | undefined
  let identityResolver: ReturnType<typeof createDefaultIdentityResolver> | undefined
  if (oauthOrgId) {
    const { dingtalkOAuth } = await import('@homurajs/3p/dingtalk')
    const preset = dingtalkOAuth({ orgId: oauthOrgId, baseUrl: config.get('oauthBaseUrl') })
    client = new OAuth2Client({
      clientId: config.get('oauthClientId') ?? '',
      clientSecret: config.get('oauthClientSecret') ?? '',
      redirectUri: config.get('oauthRedirectUri') ?? '',
      scopes: ['openid'],
      stateKv,
      fetchImpl,
      ...preset,
    })
    // Identity resolver：JIT 默认开启，OAuth2 首次登录自动建户
    identityResolver = createDefaultIdentityResolver(userStore, linkStore, {
      jit: config.get('authOauth2Jit'),
    })
  }

  // WebAuthn provider（如果启用且配齐 rpId/origin）。
  // ⚠ 此前 AUTH_WEBAUTHN_ENABLED 只决定建不建表，路由从不挂载（死配置）。现补上服务端接线：
  //   challenge 复用 stateKv（SQL 形态内存版 / REST 形态 DB 版，与 OAuth2 state 同机制）；
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
      const {
        WebAuthProvider,
        createWebAuthnRoutes,
        createDrizzleWebauthnCredentialStore,
        createRestWebauthnCredentialStore,
      } = await import('@homurajs/auth/webauthn')
      const credentialStore =
        bundle.kind === 'sql'
          ? createDrizzleWebauthnCredentialStore(bundle.db)
          : createRestWebauthnCredentialStore(bundle.rest)
      const webauthn = new WebAuthProvider({
        rpId: webauthnRpId,
        rpName: config.get('authWebauthnRpName') ?? webauthnRpId,
        // 多 origin 用逗号分隔（env.ts 约定）
        origin: webauthnOrigin
          .split(',')
          .map((s) => s.trim())
          .filter((s) => s !== ''),
        credentialStore,
        userStore,
        challengeKv: stateKv,
      })
      webauthnRoutes = createWebAuthnRoutes({ webauthn, sessions, secure: secureCookies })
    }
  }

  // 组合 auth 路由：createAuthRoutes 装 OAuth2 + Password + refresh/logout，
  // WebAuthn 路由是独立子路径，route() 进同一个 authRoutes（AuthInject 契约不变）。
  const authRoutes = createAuthRoutes({
    sessions,
    oauth2: client && identityResolver ? { client, identityResolver, provider: 'dingtalk' } : undefined,
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

async function buildStorage(config: AppConfig, bundle: DbBundle): Promise<FileStorage | undefined> {
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
      // ⚠ 阿里云 OSS 必须 false（virtual-hosted）；minio 用缺省 true（path-style）
      forcePathStyle: config.get('s3ForcePathStyle'),
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
  if (backend === 'db') {
    // DB-backed：二进制分块存进 homura_files（清单）+ homura_file_chunks（数据）。
    // **qw-pages 上唯一可用的 storage 后端**（local/s3/supabase 在 Pages 全倒，见 AGENTS.md 支持矩阵）。
    // 强制分块绕开网关 body 上限；有可配总上限，大文件请改用 s3 预签名直传。
    const { createDrizzleFileStore, createRestFileStore } = await import('@homurajs/storage/db')
    const opts = {
      maxTotalBytes: config.get('storageDbMaxBytes'),
      chunkSize: config.get('storageDbChunkSize'),
    }
    // SQL 形态自建表（CREATE IF NOT EXISTS，与迁移幂等共存）；REST 形态不建表，须部署期迁移预建
    return bundle.kind === 'sql'
      ? createDrizzleFileStore(bundle.db, opts)
      : createRestFileStore(bundle.rest, opts)
  }
  return undefined
}

async function buildLicense(
  config: AppConfig,
  bundle: DbBundle,
  opts: { server: string; healthzPath: string; fetchImpl?: typeof fetch; logger?: Logger },
) {
  const { LicenseClient, createDrizzleStateStore, createRestStateStore } =
    await import('@homurajs/license')
  const { licenseGuard } = await import('@homurajs/license/hono')
  // state store 按形态选实现；REST 版不建表（无 DDL 权限），license_state 须由受控迁移预建
  const stateStore =
    bundle.kind === 'sql' ? createDrizzleStateStore(bundle.db) : createRestStateStore(bundle.rest)
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
      // 豁免清单与 createApp 注册的健康检查路径同源（qw-pages 上是 /_healthz）
      guard: licenseGuard(client, { healthzPath: opts.healthzPath, corePaths }),
    } satisfies LicenseInject,
  }
}
