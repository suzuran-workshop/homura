/**
 * REST 形态的表描述符 —— 从 schema/pg.ts **派生**，不手写第三份。
 *
 * 为什么不按 ADR-003 再 colocated 一个手写的 rest schema：PostgREST 用的就是 PG 的真实列名，
 * 手写第三份必然漂移（遗产教训 6「走原生 SQL 的表列名必须显式声明」的同一类坑）。
 * 派生让单一事实源保持在 pg.ts，parity 由构造保证而非由测试追赶。
 *
 * ⚠ 派生结果里的列名可能是 camelCase（pgCol 配方不传 name 时用 JS 属性名做列名），
 * 例如 `ownerSub` / `createdAt`——不是 owner_sub / created_at。手写极易错。
 *
 * ── 新增业务表时要改这里 ──
 * 1. 在 pg.ts / sqlite.ts 各加一份表定义，并**登记进 pgSchema / sqliteSchema 对象**
 *    （restSchema 是从 pgSchema 派生的，没登记就派生不出来）
 * 2. 在本文件用 must() 取出描述符，并加进 restBusinessTables
 *    → 部署期的探活与 /_healthz 的 db 检查会自动覆盖它（否则缺表/缺 policy 是静默失败：
 *      SELECT 返回 200 空数组、INSERT 返回 401+42501，而健康检查照报 ok）
 * 3. parity.test.ts 的表名集合断言会红，按提示补上新表名
 */
import { restSchemaFromPg, type RestTableDescriptor } from '@homurajs/db'
import { pgSchema } from './pg.js'

export const restSchema = restSchemaFromPg(pgSchema)

function must(key: string): RestTableDescriptor {
  const desc = restSchema[key]
  if (!desc) {
    throw new Error(`schema/pg.ts 的 pgSchema 里缺少 "${key}"：REST 形态无法派生表描述符`)
  }
  return desc
}

/** todos 的 REST 描述符（table 名 + 真实列名 + 主键） */
export const todosRest = must('todos')
/** auth 的 refresh_tokens（走原生 SQL，列名是显式 snake_case） */
export const refreshTokensRest = must('refreshTokens')
/** license 的 license_state（同上） */
export const licenseStateRest = must('licenseState')
/**
 * DB-backed storage 的 homura_files（清单）+ homura_file_chunks（数据分块）。
 * ⚠ 不进 restBusinessTables（那是「恒需」业务表）——仅在 STORAGE_BACKEND=db 时才需要，
 * 由 app.ts 按后端条件追加进 requiredTables（与 license_state 同模式）。
 */
export const homuraFilesRest = must('homuraFiles')
export const homuraFileChunksRest = must('homuraFileChunks')
/** auth 多凭证身份表（users/passwords/oauth2_identity_links/webauthn_credentials） */
export const usersRest = must('users')
export const passwordsRest = must('passwords')
export const oauth2IdentityLinksRest = must('oauth2IdentityLinks')
export const webauthnCredentialsRest = must('webauthnCredentials')

/**
 * 业务表清单：新增业务表时在此登记。
 * app.ts 用它拼出「本 App 实际需要哪些表」，供部署期探活与健康检查使用。
 */
export const restBusinessTables: readonly RestTableDescriptor[] = [todosRest]
