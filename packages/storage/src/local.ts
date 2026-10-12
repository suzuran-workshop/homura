/**
 * local-fs 后端：独立单机形态的缺省实现。presign 降级为代理路径。
 */
import type { FileStorage } from './index.js'

export function createLocalStorage(options: { rootDir: string; baseUrl?: string }): FileStorage {
  throw new Error('NotImplemented: createLocalStorage')
}
