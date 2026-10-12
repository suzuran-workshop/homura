import { describe, expect, it } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runMigrations } from './migrations.js'
import { createSqliteDb } from './sqlite.js'
import { sql } from 'drizzle-orm'

/** rc.4 迁移格式：每迁移一个子目录 <yyyyMMddHHmmss_name>/migration.sql，
 *  语句以 `--> statement-breakpoint` 分隔（由 drizzle-kit generate 产出） */
function makeFixture(): string {
  const dir = mkdtempSync(join(tmpdir(), 'homura-mig-'))
  const m1 = join(dir, '20260101000000_init')
  const m2 = join(dir, '20260102000000_seed')
  mkdirSync(m1, { recursive: true })
  mkdirSync(m2, { recursive: true })
  writeFileSync(
    join(m1, 'migration.sql'),
    `CREATE TABLE notes (id TEXT PRIMARY KEY, body TEXT NOT NULL);--> statement-breakpointALTER TABLE notes ADD COLUMN created_at INTEGER;`,
  )
  writeFileSync(
    join(m2, 'migration.sql'),
    `INSERT INTO notes (id, body, created_at) VALUES ('1', 'first', 0);`,
  )
  return dir
}

describe('runMigrations（sqlite 双轨之一）', () => {
  it('按序执行迁移并建表', async () => {
    const dir = makeFixture()
    try {
      const db = createSqliteDb({ dialect: 'sqlite', path: ':memory:' })
      await runMigrations(db, dir)
      const rows = await db.all<{ body: string }>(sql`SELECT body FROM notes WHERE id = '1'`)
      expect((rows as unknown as Array<{ body: string }>)[0]).toMatchObject({ body: 'first' })
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('幂等：重复运行不重复执行（drizzle 迁移记录表）', async () => {
    const dir = makeFixture()
    try {
      const db = createSqliteDb({ dialect: 'sqlite', path: ':memory:' })
      await runMigrations(db, dir)
      await runMigrations(db, dir) // 不应抛错或重复插入
      const rows = await db.all<{ c: number }>(sql`SELECT COUNT(*) as c FROM notes`)
      expect((rows as unknown as Array<{ c: number }>)[0]).toMatchObject({ c: 1 })
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
