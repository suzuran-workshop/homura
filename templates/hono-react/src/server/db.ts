/**
 * db 装配：按方言建库 + 跑迁移/探活。
 *
 * 三形态（2026-10-13 线上实测校准，逐项定论见 docs/specs/module-qw-pages.md）：
 * - `sqlite`：standalone 单机，node:sqlite 写本地文件
 * - `pg`：standalone + 自建 pgsql / 自托管 supabase（Supavisor 直连）
 * - `rest`：qw-pages 唯一可用形态，PostgREST over HTTPS
 *
 * 渐进式耦合仍然成立：sqlite-only 的 App 不触发 '@homurajs/db/pg' 的副作用 import；
 * rest 形态是零依赖的纯 fetch 实现，也不需要 postgres。
 */
import {
  createDb,
  createRestDb,
  loadPostgrestEnv,
  runMigrations,
  type Database,
  type RestDb,
} from '@homurajs/db'
import { detectRuntime } from '@homurajs/core'
import { resolveDialect, type AppConfig, type Dialect } from './env.js'

/**
 * db 产物联合：SQL 形态给 drizzle Database，REST 形态给 RestDb。
 * 二者不共享接口（REST 没有 query builder），故用 kind 判别，
 * 消费方（app.ts）按 kind 选择 repository 与 store 实现。
 */
export type DbBundle =
  | { kind: 'sql'; dialect: 'sqlite' | 'pg'; db: Database }
  | { kind: 'rest'; dialect: 'rest'; rest: RestDb }

/** 按方言建库；dialect 缺省由 resolveDialect 按运行形态解析 */
export async function buildDb(
  config: AppConfig,
  dialect: Dialect = resolveDialect(config),
): Promise<DbBundle> {
  if (dialect === 'rest') {
    const { url, apiKey } = loadPostgrestEnv(process.env)
    return { kind: 'rest', dialect: 'rest', rest: createRestDb({ url, apiKey }) }
  }

  // 显式选了 sqlite/pg 却跑在 qw-pages 上 → 明确报错，不要让用户在运行时撞 EACCES 或超时
  if (detectRuntime(process.env).target === 'qw-pages') {
    throw new Error(
      `DIALECT=${dialect} 在 qw-pages 上不可用：` +
        (dialect === 'sqlite'
          ? '应用根目录对进程只读（实测 mkdir ./data → EACCES），唯一可写的 QWENWORK_WRITABLE_DIR 跨发布清空'
          : '平台不下发 SUPABASE_PROJECT_REF / SUPABASE_DB_PASSWORD / DATABASE_URL，且 5432 出网实测 timeout') +
        '。请改用 DIALECT=rest（PostgREST），或部署为 standalone。',
    )
  }

  if (dialect === 'sqlite') {
    const db = createDb({ dialect: 'sqlite', path: config.get('sqlitePath') })
    return { kind: 'sql', dialect, db }
  }

  // pg：动态注册 driver（副作用 import）
  await import('@homurajs/db/pg')
  const supabaseRef = config.get('supabaseProjectRef')
  const databaseUrl = config.get('databaseUrl')

  let url: string
  let prepare = true
  if (supabaseRef && config.get('supabaseDbPassword')) {
    // 自托管 supabase：Supavisor 直连
    const { buildSupabaseDbConfig } = await import('@homurajs/db/pg')
    const sb = buildSupabaseDbConfig({
      projectRef: supabaseRef,
      password: config.get('supabaseDbPassword')!,
      region: config.get('supabaseRegion'),
    })
    url = sb.url
    prepare = sb.prepare ?? true
  } else if (databaseUrl) {
    url = databaseUrl
  } else {
    throw new Error('dialect=pg 需要 DATABASE_URL 或 SUPABASE_PROJECT_REF+SUPABASE_DB_PASSWORD')
  }

  const db = createDb({ dialect: 'pg', url, prepare })
  return { kind: 'sql', dialect, db }
}

/**
 * 迁移：
 * - SQL 形态跑对应方言的 drizzle 迁移（drizzle/pg 或 drizzle/sqlite）
 * - REST 形态**没有 DDL 权限**（App 侧无法建表），改为探活校验：
 *   表与 RLS policy 必须在部署期由平台受控迁移执行 drizzle/pg 的迁移 SQL 建好。
 *   探活失败时把 RestError 的 hint 一并抛出，避免用户对着「200 空数组」 debug 半天。
 */
export async function migrate(bundle: DbBundle, restTables: string[] = ['todos']): Promise<void> {
  if (bundle.kind === 'sql') {
    const folder = bundle.dialect === 'pg' ? './drizzle/pg' : './drizzle/sqlite'
    await runMigrations(bundle.db, folder)
    return
  }
  for (const table of restTables) {
    try {
      await bundle.rest.ping(table)
    } catch (err) {
      const e = err as { message?: string; hint?: string }
      throw new Error(
        `PostgREST 探活失败（表 ${table}）：${e.message ?? String(err)}` +
          (e.hint ? `\n  → ${e.hint}` : '') +
          '\n  REST 形态的建表与 RLS policy 必须在部署期用平台受控迁移执行 drizzle/pg 的迁移 SQL；App 侧无 DDL 权限。',
      )
    }
  }
}
