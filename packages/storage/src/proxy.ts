/**
 * Hono 代理路由：/files/<key> 统一下载入口（对冲各后端 URL 策略差异）。
 */
import type { Hono } from 'hono'
import type { FileStorage } from './index.js'

export function createFileProxyRoutes(storage: FileStorage, options?: { mount?: string }): Hono {
  throw new Error('NotImplemented: createFileProxyRoutes')
}
