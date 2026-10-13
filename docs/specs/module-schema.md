# Spec — 双方言 schema（pg / sqlite）

## 要构建什么

- 目标：App 一套业务表在 pg（pgsql/supabase）与 sqlite（node:sqlite）两侧一致演进

## 差异映射表（双方言共有特性子集）

| 语义      | pg-core                                          | sqlite-core                                                              |
| --------- | ------------------------------------------------ | ------------------------------------------------------------------------ |
| UUID 主键 | `uuid().primaryKey().defaultRandom()`            | `text().primaryKey().$defaultFn(() => randomUUID())`                     |
| 时间戳    | `timestamp({ withTimezone: true }).defaultNow()` | `integer({ mode: 'timestamp_ms' }).default(sql\`(unixepoch() * 1000)\`)` |
| JSON      | `jsonb().$type<T>()`                             | `text({ mode: 'json' }).$type<T>()`                                      |
| 文本/整数 | `pgCol.text()/int()`                             | `sqliteCol.text()/int()`                                                 |

不在子集内（pg 专属 array/jsonb 索引操作、sqlite 的 WITHOUT ROWID 等）禁止使用。

## ⚠ 列名规则（血泪教训）

- schema-helpers 的配方**默认用 JS 属性名做 DB 列名**（camelCase）：`pgCol.text()` → 列名取属性名
- 需要 snake_case 列名时**显式传入**：`pgCol.text('token_hash')`
- **走原生 SQL 的表（auth refresh_tokens、license license_state）必须显式 snake_case**，
  且与各自 store.ts 的原生 SQL 列名严格对齐——否则运行时列名不匹配必崩
- **parity 测不出这个 bug**：它只比对 pg↔sqlite 两侧列名（两边都 camelCase 自然一致）
- 铁律：改这类表的列名，务必同步 store.ts，并以 `drizzle-kit generate` 产物 DDL 为准复核
- 走 query builder 的业务表（如 todos）由 drizzle 自动映射，保持 camelCase 无需显式列名

## App schema 写法（colocated 双文件）

```
src/server/schema/
├── pg.ts      # import { pgTable, pgCol, pgJson } from '@homurajs/db/schema-helpers'
├── sqlite.ts  # import { sqliteTable, sqliteCol, sqliteJson } from '@homurajs/db/schema-helpers'
└── parity.test.ts  # assertSchemaParity(pgSchema, sqliteSchema) 硬门禁
```

第三方包的表从子路径 spread 进两侧 schema 参与迁移：
`@homurajs/auth/tables`（refresh_tokens）、`@homurajs/license/tables`（license_state）。

**第三份（REST）不手写，而是派生**：`schema/rest.ts` 只做一件事——
`export const restSchema = restSchemaFromPg(pgSchema)`。PostgREST 用的就是 PG 真实列名，
手写第三份必然漂移（本文「列名规则」那条教训的同类坑）。派生让单一事实源留在 `pg.ts`。

⚠ 派生结果里的列名可能是 camelCase：`pgCol` 配方不传 name 时用 JS 属性名做列名，
故 `todos` 的真实列是 `ownerSub`/`createdAt`（而 `refresh_tokens`/`license_state` 走原生 SQL，
是显式 snake_case）。camelCase 列名在 PostgREST 上已实测可用（`eq` / `is.null` /
`order=<col>.desc` / PATCH 全通过），**不需要**为 qw-pages 改列名策略。

## 迁移三轨

- 生成：`drizzle-kit generate --config=drizzle.pg.config.ts`（PG 方言，自托管 supabase/pgsql 共用 → drizzle/pg/）与 `drizzle.sqlite.config.ts`（→ drizzle/sqlite/）
- rc.4 产物格式：每迁移一个子目录 `<yyyyMMddHHmmss_name>/migration.sql`，语句以 `--> statement-breakpoint` 分隔（无 meta/_journal.json）
- 运行（轨一/轨二）：`runMigrations(db, folder)` 按实例分发 migrator（幂等，drizzle 自动记录已应用）
- **轨三：qw-pages 的平台受控迁移**。App 侧无 DDL 权限（PostgREST 只能读写数据），建表与 RLS policy 必须在部署期用 `qwenwork_pages_apply_migration` 执行 `drizzle/pg` 的 SQL（改成幂等：`CREATE TABLE IF NOT EXISTS` / `DROP POLICY IF EXISTS` + `CREATE POLICY`）。模板 `migrate()` 在 rest 形态改为**探活校验**（`rest.ping(table)`），失败时把 `RestError` 的 hint 一并抛出
  - 需要建的表 = 模板缺省四张（`todos` 业务、`refresh_tokens` auth、`license_state` license、`homura_ttlkv` OAuth state 的 TTL-KV）**加上派生 App 新增的每张业务表**。哪些表真的必需由模板 `app.ts` 的 `requiredTables` 决定（业务表来自 `schema/rest.ts` 的 `restBusinessTables`，能力表按 `OAUTH_DINGTALK_ORG_ID` / `GENUINE_SERVER` 是否配置追加）——新增业务表登记进 `restBusinessTables` 即自动纳入探活与健康检查
  - 每张表都要 `ENABLE ROW LEVEL SECURITY` + `FOR ALL TO anon USING (true) WITH CHECK (true)`，否则是静默失败（SELECT 返回 `200 []`、INSERT 返回 401+42501）
  - ⚠ 首次部署要按目录时间序应用 `drizzle/pg/` 下**全部**迁移，不是只应用最新那份（最新那份只含新增表，基础表在更早的目录里）
  - `GRANT ... ON ALL SEQUENCES IN SCHEMA current_schema()` 是语法错误（该位置不接受函数调用）；模板缺省那四张表都没有 serial 序列，若有则要在 DO 块里 `EXECUTE format(...)` 逐条授权
- supabase 侧执行通道（自托管）：drizzle-kit migrate 直连（Supavisor session 模式）或 supabase CLI

## 验收标准

- [x] pgCol/sqliteCol 配方（含可选 name 参数）+ parity（列级 primary + 表级 primaryKeys 并集指纹）
- [x] runMigrations sqlite 幂等测试
- [x] 模板真实 drizzle-kit generate 双方言迁移产物，复核 snake_case 列名落地
- [x] 模板 e2e 走真实迁移建表 + todos CRUD（sqlite :memory:）
- [ ] pg 侧 CI（postgres service）迁移往返
