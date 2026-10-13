/**
 * REST 形态的表描述符 —— 从 schema/pg.ts **派生**，不手写第三份。
 *
 * 为什么不按 ADR-003 再 colocated 一个手写的 rest schema：PostgREST 用的就是 PG 的真实列名，
 * 手写第三份必然漂移（遗产教训 6「走原生 SQL 的表列名必须显式声明」的同一类坑）。
 * 派生让单一事实源保持在 pg.ts，parity 由构造保证而非由测试追赶。
 *
 * ⚠ 派生结果里的列名是 camelCase（pgCol 配方不传 name 时用 JS 属性名做列名），
 * 例如 `ownerSub` / `createdAt`——不是 owner_sub / created_at。手写极易错。
 */
import { restSchemaFromPg } from '@homurajs/db'
import { pgSchema } from './pg.js'

export const restSchema = restSchemaFromPg(pgSchema)

const todosDesc = restSchema['todos']
if (!todosDesc) {
  throw new Error('schema/pg.ts 缺少 todos 表：REST 形态无法派生表描述符')
}

/** todos 的 REST 描述符（table 名 + 真实列名 + 主键） */
export const todosRest = todosDesc
