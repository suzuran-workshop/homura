/**
 * PostgREST 数据访问层 —— qw-pages 形态**唯一可用**的持久化路径。
 *
 * 为什么必须有这一层（2026-10-13 线上实测，逐项见 docs/specs/module-qw-pages.md）：
 * - PG 直连不可用：平台不下发 SUPABASE_PROJECT_REF / SUPABASE_DB_PASSWORD / DATABASE_URL，
 *   且对 supabase 主机 5432 的 TCP 连接 timeout（443 可连）；
 * - node:sqlite 不可用：应用根目录只读（实测 mkdir ./data → EACCES），
 *   唯一可写的 QWENWORK_WRITABLE_DIR 跨发布清空（实测重发布后历史文件消失）；
 * - PostgREST 可用且持久：INSERT/SELECT/PATCH/DELETE + return=representation 全绿，
 *   跨发布回读旧行成功（序列连续）。
 *
 * ⚠ 两个必须知道的实测行为：
 * 1. **RLS 缺 policy 时是静默失败**：SELECT 返回 `200 []`（看着像空库），
 *    INSERT 返回 **HTTP 401** + body `{"code":"42501"}`（不是 403）。
 *    故 RestError 对 42501/404 附中文 hint，指向「policy/表须由平台受控迁移创建」。
 * 2. **upsert 必须显式给冲突目标**：唯一列不是主键时，只给
 *    `Prefer: resolution=merge-duplicates` 会得到 409/23505；
 *    加 `?on_conflict=<唯一列>` 才返回 200 合并行（本层用 insert(rows,{upsertOn})表达）。
 *
 * 无 DDL 能力：App 侧不能建表（平台迁移角色对 storage schema 也无权）。
 * 表与 policy 由部署期用 qwenwork_pages_apply_migration 创建，App 只读写。
 */

/** PostgREST 支持的过滤算子子集（够用即止，不追求全覆盖） */
export type RestOp = 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'like' | 'ilike' | 'is' | 'in'

export interface RestCondition {
  op: RestOp
  value: unknown
}

/** 简写：`col: v` = eq.v；`col: null` = is.null；`col: [a,b]` = in.(a,b)；其余用显式 {op,value} */
export type RestFilterValue =
  string | number | boolean | null | RestCondition | Array<string | number | boolean>

export type RestFilters = Record<string, RestFilterValue>

export interface RestSelectOptions {
  /** PostgREST 排序串，如 'created_at.desc' */
  order?: string
  limit?: number
  /** 返回列（缺省 '*'） */
  columns?: string
}

export interface RestRow {
  [column: string]: unknown
}

export interface RestTable<TRow extends RestRow = RestRow> {
  select(filters?: RestFilters, opts?: RestSelectOptions): Promise<TRow[]>
  /** upsertOn = 冲突目标列（唯一列非主键时必填，否则 409/23505） */
  insert(rows: Partial<TRow> | Partial<TRow>[], opts?: { upsertOn?: string }): Promise<TRow[]>
  update(patch: Partial<TRow>, filters: RestFilters): Promise<TRow[]>
  /** 返回被删的行（PostgREST DELETE + return=representation，实测可用） */
  remove(filters: RestFilters): Promise<TRow[]>
}

export interface RestDbOptions {
  /** SUPABASE_URL */
  url: string
  /** SUPABASE_ANON_KEY */
  apiKey: string
  fetchImpl?: typeof fetch
  /** 多 schema 时的 Accept-Profile/Content-Profile；qw-pages 实测默认 schema 已含租户 schema，通常不需要 */
  schema?: string
}

export interface RestDb {
  table<TRow extends RestRow = RestRow>(name: string): RestTable<TRow>
  /** 探活：limit=1 查询；表不存在或无权限会抛 RestError（供启动期自检） */
  ping(tableName: string): Promise<void>
}

/** PostgREST 错误：保留 HTTP 状态与 PG 错误码，并对两类高频静默失败给中文指引 */
export class RestError extends Error {
  readonly status: number
  readonly code: string | null
  readonly hint?: string

  constructor(status: number, code: string | null, message: string, hint?: string) {
    super(hint ? `${message}（${hint}）` : message)
    this.name = 'RestError'
    this.status = status
    this.code = code
    this.hint = hint
  }
}

function isCondition(v: RestFilterValue): v is RestCondition {
  return typeof v === 'object' && v !== null && !Array.isArray(v) && 'op' in v
}

function enc(v: unknown): string {
  return v === null ? 'null' : encodeURIComponent(String(v))
}

/**
 * 过滤条件 → 已编码的 `[key, rhs]` 条目（单测直接断言这个纯函数）。
 *
 * 编码策略：PostgREST 的语法标点（`.` `(` `)` `,`）保持**字面量**，只对列名与值做
 * encodeURIComponent。这样拼出的 query 与线上实测通过的请求形态一致
 * （探针用 `uid=in.(a,b)`、`owner_sub=is.null` 实测 200），也便于日志排查。
 *
 * ⚠ 不要再把结果喂给 URLSearchParams：它会对已编码的值二次编码
 *   （`in.(a,b)` → `in.%28a%2Cb%29`）。用 buildFilterQuery 直接拼。
 * ⚠ 值本身含逗号时会被编码为 %2C，与列表分隔符可区分；但 PostgREST 侧的引号语义未覆盖。
 */
export function buildFilterEntries(filters: RestFilters): Array<[string, string]> {
  const out: Array<[string, string]> = []
  for (const [col, raw] of Object.entries(filters)) {
    const key = encodeURIComponent(col)
    if (raw === null) {
      out.push([key, 'is.null'])
    } else if (Array.isArray(raw)) {
      out.push([key, `in.(${raw.map(enc).join(',')})`])
    } else if (isCondition(raw)) {
      const value =
        raw.op === 'in' && Array.isArray(raw.value)
          ? `(${(raw.value as unknown[]).map(enc).join(',')})`
          : enc(raw.value)
      out.push([key, `${raw.op}.${value}`])
    } else {
      out.push([key, `eq.${enc(raw)}`])
    }
  }
  return out
}

/** 过滤条件 → query 片段（不含前导 '?'；空条件返回空串） */
export function buildFilterQuery(filters: RestFilters): string {
  return buildFilterEntries(filters)
    .map(([k, v]) => `${k}=${v}`)
    .join('&')
}

function toRestError(status: number, body: string, path: string): RestError {
  let code: string | null = null
  let message = body.slice(0, 300)
  try {
    const parsed = JSON.parse(body) as { code?: string; message?: string }
    if (typeof parsed.code === 'string') code = parsed.code
    if (typeof parsed.message === 'string') message = parsed.message
  } catch {
    // 非 JSON 响应体（网关错误页等）：原样保留截断文本
  }
  let hint: string | undefined
  if (code === '42501' || (status === 401 && /row-level security/i.test(message))) {
    hint =
      'RLS 拒绝：该表缺当前角色（anon）的 policy。qw-pages 上 policy 只能用平台受控迁移创建，App 无 DDL 权限；' +
      '注意此时 SELECT 仍会返回 200 空数组，别把「查不到」当成「没数据」'
  } else if (status === 404) {
    hint = '表不存在或未被 PostgREST 暴露：qw-pages 上表须由平台受控迁移创建在租户 schema 内'
  } else if (code === '23505') {
    hint = '唯一键冲突：upsert 需显式指定冲突目标，用 insert(rows, { upsertOn: "<唯一列>" })'
  }
  return new RestError(status, code, `${message} [${path}]`, hint)
}

export function createRestDb(options: RestDbOptions): RestDb {
  const fetchImpl = options.fetchImpl ?? fetch
  const base = `${options.url.replace(/\/$/, '')}/rest/v1`
  const profile = options.schema

  const baseHeaders = (): Record<string, string> => ({
    apikey: options.apiKey,
    authorization: `Bearer ${options.apiKey}`,
    accept: 'application/json',
    ...(profile ? { 'accept-profile': profile, 'content-profile': profile } : {}),
  })

  async function run<TRow>(path: string, init: RequestInit, prefer: string[]): Promise<TRow[]> {
    const headers: Record<string, string> = {
      ...baseHeaders(),
      ...(init.headers as Record<string, string> | undefined),
    }
    if (prefer.length > 0) headers['prefer'] = prefer.join(',')
    const res = await fetchImpl(`${base}/${path}`, { ...init, headers })
    const text = await res.text()
    if (!res.ok) throw toRestError(res.status, text, path)
    if (text === '') return []
    return JSON.parse(text) as TRow[]
  }

  const withFilters = (name: string, filters: RestFilters): string => {
    const q = buildFilterQuery(filters)
    return q === '' ? name : `${name}?${q}`
  }

  function table<TRow extends RestRow>(name: string): RestTable<TRow> {
    const encName = encodeURIComponent(name)
    const json = { 'content-type': 'application/json' }
    return {
      select: (filters = {}, opts = {}) => {
        // 手工拼 query（见 buildFilterEntries 的编码策略说明，勿用 URLSearchParams 二次编码）
        const parts = [
          buildFilterQuery(filters),
          `select=${encodeURIComponent(opts.columns ?? '*')}`,
        ]
        if (opts.order) parts.push(`order=${encodeURIComponent(opts.order)}`)
        if (opts.limit !== undefined) parts.push(`limit=${opts.limit}`)
        const q = parts.filter((p) => p !== '').join('&')
        return run<TRow>(`${encName}?${q}`, { method: 'GET' }, [])
      },
      insert: (rows, opts = {}) => {
        const suffix = opts.upsertOn ? `?on_conflict=${encodeURIComponent(opts.upsertOn)}` : ''
        const prefer = opts.upsertOn
          ? ['return=representation', 'resolution=merge-duplicates']
          : ['return=representation']
        return run<TRow>(
          `${encName}${suffix}`,
          { method: 'POST', headers: json, body: JSON.stringify(rows) },
          prefer,
        )
      },
      update: (patch, filters) =>
        run<TRow>(
          withFilters(encName, filters),
          { method: 'PATCH', headers: json, body: JSON.stringify(patch) },
          ['return=representation'],
        ),
      remove: (filters) =>
        run<TRow>(withFilters(encName, filters), { method: 'DELETE' }, ['return=representation']),
    }
  }

  return {
    table,
    async ping(tableName) {
      await table(tableName).select({}, { limit: 1 })
    },
  }
}

/**
 * 从 env 解析 PostgREST 连接参数（qw-pages 自动注入这两项）。
 * 与 @homurajs/storage 的 loadSupabaseStorageEnv 读同样的变量但刻意各自实现：
 * 能力包之间不互相硬依赖（ADR-005），六行重复优于一条 db→storage 的依赖边。
 */
export function loadPostgrestEnv(env: NodeJS.ProcessEnv): { url: string; apiKey: string } {
  const url = (env['SUPABASE_URL'] ?? '').replace(/\/$/, '')
  const apiKey = env['SUPABASE_ANON_KEY'] ?? ''
  const missing = [
    url === '' ? 'SUPABASE_URL' : null,
    apiKey === '' ? 'SUPABASE_ANON_KEY' : null,
  ].filter((x): x is string => x !== null)
  if (missing.length > 0) {
    throw new Error(
      `PostgREST 环境不完整：缺少 ${missing.join(' 与 ')}。` +
        '（qw-pages 绑定数据库后会自动注入；独立部署请自行设置，或改用 dialect=sqlite/pg）',
    )
  }
  return { url, apiKey }
}
