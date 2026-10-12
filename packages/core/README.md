# @homura/core

基座包（零依赖）：运行环境探测、配置装载、结构化日志、TTL-KV。

```ts
import { detectRuntime, defineConfig, parses, createLogger, createMemoryTtlKv } from '@homura/core'

// 1. 环境：HOMURA_RUNTIME 显式优先，QW_PAGES* 标记启发式
const { target } = detectRuntime(process.env) // 'standalone' | 'qw-pages'

// 2. 配置即文档：load() + help()（生成 .env.example 片段）
const config = defineConfig({
  port: { env: 'PORT', default: 3000, parse: parses.int, description: '监听端口' },
  secret: { env: 'APP_SECRET', parse: parses.string, required: true, secret: true },
})
const cfg = config.load()

// 3. 日志：JSON lines、级别过滤、敏感字段打码、child scope
const log = createLogger().child('auth')
log.info('登录成功', { userId: 'u1' })

// 4. TTL-KV：一次性消费语义（OAuth state 等）
const kv = createMemoryTtlKv()
await kv.set(state, value, 5 * 60_000)
const taken = await kv.take(state) // 取出即删；过期 null
```

多实例部署改用 `@homura/db` 的 `createDbTtlKv`。使用示范见 `templates/hono-react/src/server/app.ts`（buildAuth 里 `stateKv: createMemoryTtlKv()`）。
