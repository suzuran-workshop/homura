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
