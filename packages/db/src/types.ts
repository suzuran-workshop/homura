import type { NodeSQLiteDatabase } from 'drizzle-orm/node-sqlite'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'

/** PostgreSQL 直连（pgsql 独立部署 / supabase Supavisor 直连共用） */
export interface PgDbConfig {
  dialect: 'pg'
  url: string
  /** postgres-js max connections */
  max?: number
  idleTimeout?: number
  /** 事务型 pooler（Supavisor transaction 模式）必须 false */
  prepare?: boolean
  ssl?: boolean
}

/** node:sqlite（Node >= 22.5，独立单机形态） */
export interface SqliteDbConfig {
  dialect: 'sqlite'
  /** 文件路径或 ':memory:' */
  path: string
}

export type DbConfig = PgDbConfig | SqliteDbConfig

export type PgDatabase = PostgresJsDatabase
export type SqliteDatabase = NodeSQLiteDatabase
export type Database = PgDatabase | SqliteDatabase

/**
 * drizzle 双方言共用的 query builder 最小接口（select/insert/update/delete + 链式）。
 *
 * 为什么需要它：`Database` 是 PgDatabase | SqliteDatabase 联合，`db.select().from(table)`
 * 无法静态匹配「db 方言 × table 方言」的 4 种组合（其中 2 种非法）。两 driver 的
 * query builder 方法签名一致，故收敛为此接口，repo 层只转型一次。
 *
 * 从本包导出是为了让派生 App 的每个新 repo 复用同一份定义，而不是各复制一遍
 * （冷启动验收发现的重复）。
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
export interface DrizzleSelectFrom {
  where(c: any): Promise<any[]> & { orderBy(c: any): Promise<any[]> }
}
export interface DrizzleQueryable {
  select(): { from(t: any): DrizzleSelectFrom }
  insert(t: any): { values(v: any): { returning(): Promise<any[]> } }
  update(t: any): { set(v: any): { where(c: any): { returning(): Promise<any[]> } } }
  delete(t: any): { where(c: any): { returning(): Promise<any[]> } }
}
/* eslint-enable @typescript-eslint/no-explicit-any */
