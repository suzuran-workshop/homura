/**
 * qw-pages 入口：与 standalone 同构，差异只在 adapter。
 *
 * 2026-10-13 线上实测（详见 docs/specs/module-qw-pages.md）：qw-pages 动态页 = 平台拉起
 * `node <entrypoint>` 的**常驻进程**，注入 PORT/HOST 并把网关流量反代到该 socket；
 * 不存在 default/fetch/app 之类的 serverless 导出约定（探针双路计数：serve 命中 47 次、handler 0 次）。
 * 故原「三导出对冲 + start() 抛错拒绝监听」已删除。
 *
 * 顺带移除一个隐患：旧写法 `export const fetch = handlers.fetch` 会在本模块内遮蔽全局 fetch，
 * 之后任何顶层 fetch 调用都会打到自己的 handler 上。
 */
import { loadConfig } from './env.js'
import { buildApp } from './app.js'
import { createLogger } from '@homurajs/core'
import { createQwPagesAdapter } from '@homurajs/app-kit/qw-pages'

const logger = createLogger({ level: (process.env.LOG_LEVEL as never) ?? 'info' }).child('qw-pages')

async function main(): Promise<void> {
  const config = loadConfig()
  const adapter = createQwPagesAdapter()
  const staticDir = config.get('assetsDir') ?? adapter.assetsDir(process.env)

  const built = await buildApp(config, {
    logger,
    staticDir,
    // 网关后（公网 https）→ cookie 必须 Secure；standalone 由 TRUST_PROXY=1 决定
    secureCookies: adapter.trustProxy(),
  })

  // 平台不保证 SIGTERM（实测重发布直接换实例、进程内文件全清），尽力而为即可
  const ac = new AbortController()
  const shutdown = async () => {
    logger.info('shutting down')
    await built.onStop?.()
    ac.abort()
    process.exit(0)
  }
  process.on('SIGTERM', () => void shutdown())
  process.on('SIGINT', () => void shutdown())

  // 端口与 HOST 由 adapter 从 process.env 读（实测注入 PORT=8081、HOST=127.0.0.1）
  await adapter.start(built.app, { signal: ac.signal })
  await built.onStart?.()
  logger.info('listening', { runtime: built.runtime.target, healthz: built.healthzPath })
}

void main().catch((err: Error) => {
  logger.error('fatal', { err: err.message, stack: err.stack })
  process.exit(1)
})
