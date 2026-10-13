# @homurajs/db

持久层：三种数据方言 + 双方言 schema 配方 + 三轨迁移。

| 方言     | 适用形态                                      | 说明                                  |
| -------- | --------------------------------------------- | ------------------------------------- |
| `sqlite` | standalone 单机                               | `node:sqlite`，零外部依赖             |
| `pg`     | standalone + 自建 pgsql / **自托管** supabase | postgres-js，`./pg` 子路径注册 driver |
| `rest`   | **qw-pages 唯一可行**                         | PostgREST over HTTPS，零依赖纯 fetch  |

> ⚠ qw-pages 上 `sqlite` 与 `pg` 都不可用（应用根只读、可写区跨发布清空；不下发 PG 凭据且 5432 出网被封）。实测依据见 `docs/specs/module-qw-pages.md`。

```ts
// ── sqlite（独立单机，零外部依赖）──
import { createDb, runMigrations } from '@homurajs/db'
const db = createDb({ dialect: 'sqlite', path: './app.db' })
await runMigrations(db, './drizzle/sqlite')

// ── pg（需安装 postgres；import 即注册 driver）──
import '@homurajs/db/pg'
import { buildSupabaseDbConfig, loadSupabaseEnv } from '@homurajs/db/pg'
const db2 = createDb(
  buildSupabaseDbConfig({
    projectRef: 'abcdefghij',
    password: '...',
    region: 'ap-southeast-1',
  }),
) // Supavisor 443 直连，transaction 模式自动 prepare:false
// loadSupabaseEnv(env) 只返回 { dbConfig }：它要 SUPABASE_PROJECT_REF + SUPABASE_DB_PASSWORD，
// 仅自托管 supabase 有这两项。对象存储的 env 解析在 @homurajs/storage（只需 URL + anon key）

// ── rest（qw-pages）──
import {
  createRestDb,
  loadPostgrestEnv,
  restSchemaFromPg,
  assertRestColumns,
  createRestTtlKv,
} from '@homurajs/db'
const rest = createRestDb(loadPostgrestEnv(process.env)) // 读 SUPABASE_URL + SUPABASE_ANON_KEY
const rows = await rest
  .table('todos')
  .select({ ownerSub: null }, { order: 'createdAt.desc', limit: 20 })
await rest.table('todos').insert({ title: 'x', done: false, ownerSub: null })
await rest.table('todos').update({ done: true }, { id }) // PATCH + return=representation
await rest.table('todos').remove({ id }) // DELETE + return=representation
await rest.table('kv').insert(row, { upsertOn: 'key' }) // upsert：唯一列非主键时必填
await rest.ping('todos') // 启动期探活

// ── schema：手写两份，派生第三份 ──
import { pgCol, pgTable, sqliteCol, sqliteTable } from '@homurajs/db/schema-helpers'
export const pgTodos = pgTable('todos', {
  id: pgCol.id(),
  title: pgCol.text(),
  createdAt: pgCol.createdAt(),
})
export const sqliteTodos = sqliteTable('todos', {
  id: sqliteCol.id(),
  title: sqliteCol.text(),
  createdAt: sqliteCol.createdAt(),
})
assertSchemaParity({ todos: pgTodos }, { todos: sqliteTodos }) // parity 硬门禁
const restDesc = restSchemaFromPg({ todos: pgTodos })['todos'] // → { table, columns, primaryKeys }
assertRestColumns(restDesc, ['id', 'title', 'createdAt']) // 缺列即抛，指向受控迁移
```

**REST 侧不要手写第三份 schema**：`restSchemaFromPg` 从 drizzle pg 表元数据派生，列名就是 PG 真实列名。`pgCol` 不传 name 时列名是 JS 属性名（camelCase，如 `ownerSub`/`createdAt`），手写极易错成 snake_case。camelCase 列名在 PostgREST 上已实测可用。

**必须知道的两个静默失败**（`RestError` 会附中文 hint）：

- RLS 缺 policy 时 `SELECT` 返回 `200 []`（看着像空库），`INSERT` 返回 **HTTP 401** + PG code `42501`（不是 403）
- upsert 在唯一列非主键时必须给 `?on_conflict=<列>`，否则 `409 / 23505`；且被 RLS 拒掉的写入仍会消耗序列值

**三轨迁移**：sqlite 走 `drizzle/sqlite`、pg 走 `drizzle/pg`，都由 `runMigrations` 跑；**rest 形态 App 无 DDL 权限**，建表与 policy 必须在部署期用平台受控迁移执行 `drizzle/pg` 的 SQL（配方见 `docs/specs/module-qw-pages.md`）。

差异映射与 rc.4 迁移格式见 `docs/specs/module-schema`。使用示范见模板 `src/server/db.ts`、`schema/rest.ts` 与 `todos-repo.ts`。
