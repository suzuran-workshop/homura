# Spec — 双方言 schema（pg / sqlite）

## 要构建什么
- 目标：App 一套业务表在 pg（pgsql/supabase）与 sqlite（node:sqlite）两侧一致演进

## 差异映射表（双方言共有特性子集）

| 语义 | pg-core | sqlite-core |
|------|---------|-------------|
| UUID 主键 | `uuid().primaryKey().defaultRandom()` | `text().primaryKey().$defaultFn(() => randomUUID())` |
| 时间戳 | `timestamp({ withTimezone: true }).defaultNow()` | `integer({ mode: 'timestamp_ms' }).default(sql\`(unixepoch() * 1000)\`)` |
| JSON | `jsonb().$type<T>()` | `text({ mode: 'json' }).$type<T>()` |
| 文本/整数 | `pgCol.text()/int()` | `sqliteCol.text()/int()` |

不在子集内（pg 专属 array/jsonb 索引操作、sqlite 的 WITHOUT ROWID 等）禁止使用。

## App schema 写法（colocated 双文件）
```
src/server/schema/
├── pg.ts      # import { pgTable, pgCol, pgJson } from '@homura/db/schema-helpers'
├── sqlite.ts  # import { sqliteTable, sqliteCol, sqliteJson } from '@homura/db/schema-helpers'
└── parity.test.ts  # assertSchemaParity(pgSchema, sqliteSchema) 硬门禁
```
第三方包的表（auth 的 refresh_tokens、license 的 license_state）spread 进两侧 schema 参与迁移。

## 迁移双轨
- 生成：`drizzle-kit generate --config=drizzle.pg.config.ts`（PG 方言，supabase/pgsql 共用 → drizzle/pg/）与 `drizzle.sqlite.config.ts`（→ drizzle/sqlite/）
- rc.4 产物格式：每迁移一个子目录 `<yyyyMMddHHmmss_name>/migration.sql`，语句以 `--> statement-breakpoint` 分隔（无 meta/_journal.json）
- 运行：runMigrations(db, folder) 按实例分发 migrator（幂等，drizzle 自动记录已应用）
- supabase 侧执行通道：drizzle-kit migrate 直连（Supavisor session 模式）或 supabase CLI

## 验收标准
- [x] pgCol/sqliteCol 配方 + parity（列级 primary + 表级 primaryKeys 并集指纹）
- [x] runMigrations sqlite 幂等测试
- [ ] pg 侧 CI（postgres service）迁移往返
