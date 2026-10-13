# @homurajs/db

持久层：Drizzle 双 driver（postgres-js / node:sqlite）+ 双方言 schema 配方 + 迁移双轨 + supabase 直连。

```ts
// sqlite（独立单机形态，零外部依赖）
import { createDb, runMigrations } from '@homurajs/db'
const db = createDb({ dialect: 'sqlite', path: './app.db' })

// pg / supabase（需安装 postgres；import 即注册 driver）
import '@homurajs/db/pg'
import { buildSupabaseDbConfig } from '@homurajs/db/pg'
const db2 = createDb(buildSupabaseDbConfig({
  projectRef: 'abcdefghij', password: '...', region: 'ap-southeast-1',
})) // Supavisor 443 直连，transaction 模式自动 prepare:false

// 双方言 schema（colocated 双文件 + 配方 + parity 门禁）
import { pgCol, pgTable, sqliteCol, sqliteTable } from '@homurajs/db/schema-helpers'
export const pgTodos = pgTable('todos', { id: pgCol.id(), title: pgCol.text(), createdAt: pgCol.createdAt() })
export const sqliteTodos = sqliteTable('todos', { id: sqliteCol.id(), title: sqliteCol.text(), createdAt: sqliteCol.createdAt() })
// 测试里 assertSchemaParity({ todos: pgTodos }, { todos: sqliteTodos }) 锁一致

// 迁移（生成：drizzle-kit generate 双配置；运行按实例分发）
await runMigrations(db, './drizzle/sqlite')
```

差异映射与 rc.4 迁移格式见 `docs/specs/module-schema`。使用示范见模板 `src/server/db.ts` 与 `schema/`。
