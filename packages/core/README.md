# @homurajs/core

基座包（零依赖）：运行环境探测、形态相关常量、配置装载、部署期配置文件、结构化日志、TTL-KV。

```ts
import {
  detectRuntime,
  healthzPathFor,
  HEALTHZ_PATH,
  defineConfig,
  parses,
  applyEnvFile,
  resolveConfigFilePath,
  parseEnvFile,
  createLogger,
  createMemoryTtlKv,
} from '@homurajs/core'

// 1. 形态探测：HOMURA_RUNTIME 显式优先，否则按平台实测注入的标记启发式判断
const { target } = detectRuntime(process.env) // 'standalone' | 'qw-pages'
// qw-pages 的标记是 QWENWORK_WRITABLE_DIR / SUPABASE_INSTANCE_ID（线上实测）；
// 平台并不注入任何 QW_PAGES* 变量，别用 HOST/PORT 当标记（standalone 也常设）

// 2. 形态相关路径常量：app-kit 注册路由与 license guard 豁免清单必须同源读它
healthzPathFor(target) // standalone → '/healthz'；qw-pages → '/_healthz'
// 原因：'/healthz' 被 qw-pages 的 Page Gateway 保留，网关自答 ok 且请求不下发到 App

// 3. 配置即文档：load() + help()（help 用于生成 .env.example）
const config = defineConfig({
  port: { env: 'PORT', default: 3000, parse: parses.int, description: '监听端口' },
  secret: { env: 'APP_SECRET', parse: parses.string, required: true, secret: true },
})
const cfg = config.load()

// 4. 部署期配置文件：qw-pages 无自定义 env 注入口，密钥只能随产物携带
//    优先级 HOMURA_CONFIG_FILE → <cwd>/homura.config.env → QWENWORK_WRITABLE_DIR/homura.config.env
//    真实 env 优先于文件；必须在 defineConfig().load() 之前调用
applyEnvFile(process.env)
parseEnvFile('A=1\n# 注释\nexport B="x\\ny"\n') // → { A: '1', B: 'x\ny' }

// 5. 日志：JSON lines、级别过滤、敏感字段打码、child scope
const log = createLogger().child('auth')
log.info('登录成功', { userId: 'u1' })

// 6. TTL-KV：一次性消费语义（OAuth state 等）
const kv = createMemoryTtlKv()
await kv.set(state, value, 5 * 60_000)
const taken = await kv.take(state) // 取出即删；过期 null
```

TTL-KV 的持久化版本在 `@homurajs/db`：SQL 形态用 `createDbTtlKv`，**qw-pages（REST 形态）用 `createRestTtlKv`**——内存版在 Pages 上进程重启即清空（跨发布必换实例），OAuth state 会断在「跳转 → 回调」两条腿之间。

使用示范见 `templates/hono-react/src/server/env.ts`（`loadConfig` 里 `applyEnvFile` + `assertSecretsOverridden`）与 `app.ts`（`stateKv` 按形态选择）。
