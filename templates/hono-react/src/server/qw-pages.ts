/**
 * qw-pages 入口：createApp + createQwPagesAdapter + exportHandlers。
 * 三重导出（default/fetch/app）对冲 qw-pages 未知入口约定；不监听端口（平台调用 fetch handler）。
 * 差异仅在此文件与 standalone index.ts 的 adapter —— 其余装配 100% 共用（见 app.ts）。
 *
 * top-level await：ESM 支持；bundle 时保持 ESM（tsdown target=node，format=esm）。
 */
import { loadConfig } from './env.js'
import { buildApp } from './app.js'
import { createLogger } from '@homura/core'
import { createQwPagesAdapter, exportHandlers } from '@homura/app-kit/qw-pages'

const logger = createLogger({ level: (process.env.LOG_LEVEL as never) ?? 'info' }).child('qw-pages')

const config = loadConfig()
const adapter = createQwPagesAdapter()
const staticDir = config.get('assetsDir') ?? adapter.assetsDir(process.env)

const built = await buildApp(config, { logger, staticDir })
// 平台托管：启动即注册 + 心跳（无 SIGTERM 保证，尽力而为）
void built.onStart?.()

const handlers = exportHandlers(built.app)

// 三重导出：覆盖 qw-pages 可能的入口约定（见 docs/specs/module-qw-pages）
export default handlers.default
export const fetch = handlers.fetch
export const app = handlers.app
