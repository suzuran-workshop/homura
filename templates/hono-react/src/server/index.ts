/**
 * standalone 入口：createApp + createNodeAdapter().start（端口监听 + 磁盘静态）。
 * qw-pages 入口见 ./qw-pages.ts（差异仅在 adapter）。
 */
import { loadConfig } from './env.js'
import { buildApp } from './app.js'
import { createLogger } from '@homura/core'
import { createNodeAdapter } from '@homura/app-kit/serve'

const logger = createLogger({ level: (process.env.LOG_LEVEL as never) ?? 'info' }).child('server')

async function main(): Promise<void> {
  const config = loadConfig()
  const adapter = createNodeAdapter()
  const staticDir = config.get('assetsDir') ?? adapter.assetsDir(process.env)

  const built = await buildApp(config, { logger, staticDir })
  const port = config.get('port')

  // 优雅关闭
  const ac = new AbortController()
  const shutdown = async () => {
    logger.info('shutting down')
    await built.onStop?.()
    ac.abort()
    process.exit(0)
  }
  process.on('SIGTERM', () => void shutdown())
  process.on('SIGINT', () => void shutdown())

  await adapter.start(built.app, { port, signal: ac.signal })
  await built.onStart?.()
  logger.info('listening', { port, runtime: built.runtime.target })
}

void main().catch((err: Error) => {
  logger.error('fatal', { err: err.message, stack: err.stack })
  process.exit(1)
})
