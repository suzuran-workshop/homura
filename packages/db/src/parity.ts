/**
 * 双方言 parity 硬门禁：用 drizzle 表元数据比对 pg/sqlite 两侧的
 * 表名/列名/主键/unique 约束，不一致抛错。
 * App 在测试里对自己全部 schema 调用，锁一致性防漂移。
 */
export function assertSchemaParity(
  pgSchema: Record<string, unknown>,
  sqliteSchema: Record<string, unknown>,
): void {
  throw new Error('NotImplemented: assertSchemaParity')
}
