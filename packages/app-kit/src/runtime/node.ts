/**
 * standalone 适配器：@hono/node-server 端口监听 + 磁盘 serveStatic。
 * 可选 peer：@hono/node-server。
 */
import type { Hono } from 'hono'
import type { RuntimeAdapter } from './adapter.js'

export function createNodeAdapter(): RuntimeAdapter {
  throw new Error('NotImplemented: createNodeAdapter')
}
