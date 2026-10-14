/**
 * DB-backed storage 的表双方言定义（./tables 子路径）——**强制分块模型**。
 *
 * 两张表：
 * - `homura_files`：清单（manifest）。不含数据本身，只记元信息 + 上传状态（uploading/complete）。
 * - `homura_file_chunks`：数据分块。每块一行，base64 文本；复合主键 (object_key, chunk_index)。
 *
 * 为什么强制分块（即使小文件也走 1 块）：qw-pages 网关对单请求 body 有上限（实测 ≥1MB 直接 413），
 * PostgREST 单值也有 ~1MB 上限（768KB raw→base64 ~1MB 报 500）。分块把每个请求压到 ~512KB base64
 * 以内，绕开两道限制，从而支持任意大小（受可配的总上限约束）。统一模型 = 一条代码路径、一个心智。
 *
 * 照 @homurajs/license/tables 的先例：App 把这两张表 spread 进自己的 schema 参与迁移；
 * createDrizzleFileStore 运行时也会 CREATE TABLE IF NOT EXISTS（幂等）；createRestFileStore
 * **不建表**（Pages 无 DDL 权限），须由部署期受控迁移预建。
 *
 * ⚠ 列名显式 snake_case，必须与 ./db.ts 的原生 SQL / PostgREST 列名严格对齐。
 * ⚠ data 列是 **base64 文本**（不是 bytea/blob）：PostgREST 对 bytea 的 JSON 编解码不可靠
 *   （2026-10-14 Pages 实测：308B 进去、618B mojibake 出来），文本列三方言一致、编解码由 db.ts 控制。
 */
import { primaryKey } from 'drizzle-orm/pg-core'
import { primaryKey as sqlitePrimaryKey } from 'drizzle-orm/sqlite-core'
import { pgCol, pgTable, sqliteCol, sqliteTable } from '@homurajs/db/schema-helpers'
import type { FileStatus } from './index.js'

export const STORAGE_FILES_TABLE = 'homura_files'
export const STORAGE_CHUNKS_TABLE = 'homura_file_chunks'

// 清单状态类型在 index.ts 定义（保持 index 轻、浏览器可 import）；此处 re-export 便于消费方
export type { FileStatus }

export const pgStorageTables = {
  homuraFiles: pgTable(STORAGE_FILES_TABLE, {
    objectKey: pgCol.text('object_key').primaryKey(),
    contentType: pgCol.text('content_type').notNull(),
    totalSize: pgCol.epochMs('total_size').notNull(), // bigint：原始字节数（可 >2^31）
    chunkSize: pgCol.int('chunk_size').notNull(), // 每块原始字节数
    chunkCount: pgCol.int('chunk_count').notNull(),
    status: pgCol.text('status').notNull(), // 'uploading' | 'complete'
    createdAt: pgCol.epochMs('created_at').notNull(),
    updatedAt: pgCol.epochMs('updated_at').notNull(),
  }),
  homuraFileChunks: pgTable(
    STORAGE_CHUNKS_TABLE,
    {
      objectKey: pgCol.text('object_key').notNull(),
      chunkIndex: pgCol.int('chunk_index').notNull(),
      data: pgCol.text('data').notNull(), // base64
    },
    (t) => [primaryKey({ columns: [t.objectKey, t.chunkIndex] })],
  ),
}

export const sqliteStorageTables = {
  homuraFiles: sqliteTable(STORAGE_FILES_TABLE, {
    objectKey: sqliteCol.text('object_key').primaryKey(),
    contentType: sqliteCol.text('content_type').notNull(),
    totalSize: sqliteCol.epochMs('total_size').notNull(),
    chunkSize: sqliteCol.int('chunk_size').notNull(),
    chunkCount: sqliteCol.int('chunk_count').notNull(),
    status: sqliteCol.text('status').notNull(),
    createdAt: sqliteCol.epochMs('created_at').notNull(),
    updatedAt: sqliteCol.epochMs('updated_at').notNull(),
  }),
  homuraFileChunks: sqliteTable(
    STORAGE_CHUNKS_TABLE,
    {
      objectKey: sqliteCol.text('object_key').notNull(),
      chunkIndex: sqliteCol.int('chunk_index').notNull(),
      data: sqliteCol.text('data').notNull(),
    },
    (t) => [sqlitePrimaryKey({ columns: [t.objectKey, t.chunkIndex] })],
  ),
}
