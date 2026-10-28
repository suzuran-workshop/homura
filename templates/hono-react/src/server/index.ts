/**
 * 入口：createApp + createNodeAdapter().start（端口监听 + 磁盘静态）。
 */
import { loadConfig } from './env.js'
import { buildApp } from './app.js'
import { createLogger } from '@homurajs/core'
import { createNodeAdapter } from '@homurajs/app-kit/serve'

const logger = createLogger({ level: (process.env.LOG_LEVEL as never) ?? 'info' }).child('server')

async function main(): Promise<void> {
  const config = loadConfig()
  const adapter = createNodeAdapter()
  const staticDir = config.get('assetsDir') ?? adapter.assetsDir(process.env)

  const built = await buildApp(config, {
    logger,
    staticDir,
    // standalone 默认直连（不 Secure）；置于自建网关后时设 TRUST_PROXY=1 即自动开启
    secureCookies: adapter.trustProxy(),
  })
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
  logger.info('listening', { port, healthz: built.healthzPath })
}

void main().catch((err: Error) => {
  logger.error('fatal', { err: err.message, stack: err.stack })
  process.exit(1)
})
