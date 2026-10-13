/**
 * 构建编排：vite build（前端）+ tsdown（后端 bundle）。
 *
 * 双形态（99% 共用，差异仅 entry + 打包策略 + manifest）：
 *   standalone（默认）：entry=src/server/index.ts，外部化第三方依赖（node_modules 运行时解析）
 *   qw-pages（HOMURA_BUILD_TARGET=qw-pages）：entry=src/server/qw-pages.ts，自包含产物目录 + manifest
 *
 * qw-pages 约定已于 2026-10-13 全部实测确认（docs/specs/module-qw-pages.md）。
 * 其中「是否执行 npm install」一项的结论修正了本文件原先的依据：
 *   平台**不装**依赖，但发布目录里现成的 node_modules 会被原样打包，且运行时能直接解析
 *   （实测 /opt/qwenwork-page/app/node_modules/... 被 import 成功）。
 * 所以「全打包」不再是保命手段，而降级为体积/简单性的选择；这里继续保留，
 * 因为它同时规避了「node_modules 里混入符号链接」这类发布物约束问题。
 *
 * ⚠ 产物不是「单文件」：tsdown/rolldown 会代码分割，实测 30 个文件 / 2.1MB
 *   （入口 server/index.mjs + 26 个 chunk）。自包含性仍然成立——真实 import 语句里的
 *   裸包只剩 Node 内置。校验时别用宽松的 grep：drizzle 源码 JSDoc 里有
 *   `* import { union } from 'drizzle-orm/pg-core'` 这类示例文本会误报。
 */
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync, rmSync, existsSync, copyFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { build } from 'tsdown'

const target = process.env.HOMURA_BUILD_TARGET ?? 'standalone'
const isQwPages = target === 'qw-pages'
const root = resolve(import.meta.dirname, '..')
const dist = resolve(root, 'dist')

const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf-8'))

console.log(`[build] target=${target}`)

// 清理旧产物
rmSync(dist, { recursive: true, force: true })

// ── ① 前端：vite build → dist/client ──
console.log('[build] client (vite)...')
execFileSync(process.execPath, [resolve(root, 'node_modules/vite/bin/vite.js'), 'build'], {
  cwd: root,
  stdio: 'inherit',
})

// ── ② 后端：tsdown → dist/server/index.mjs ──
// 关键：@homurajs/* 是源码直出包（exports → src/*.ts），external 化后运行时
// 会去 import .ts 而崩溃，故两个形态都必须打包 @homurajs/*。
//   standalone：只打包 @homurajs/*，第三方（drizzle/hono/postgres）走运行时 node_modules
//   qw-pages：全打包（noExternal /.*/）—— 不赌平台侧 npm install（自包含单文件）
const entry = isQwPages ? 'src/server/qw-pages.ts' : 'src/server/index.ts'
console.log(`[build] server (tsdown, entry=${entry})...`)
await build({
  // entry 对象语法固定输出文件名为 index（扩展名由 tsdown 定，稍后统一 rename 为 .mjs）
  entry: { index: resolve(root, entry) },
  outDir: resolve(dist, 'server'),
  format: 'esm',
  target: 'node22',
  platform: 'node',
  noExternal: isQwPages ? [/.*/] : [/^@homurajs\//],
  // 禁用配置文件自动加载（否则 tsdown 误读 vite/vitest.config 触发 define 警告）
  config: false,
  clean: false,
  sourcemap: false,
  minify: false,
})

// tsdown ESM 产出 index.js；统一 rename 为 index.mjs（明确 ESM，qw-pages 上传后
// 无 package.json type:module 上下文也安全）
const { renameSync } = await import('node:fs')
const rawOut = resolve(dist, 'server', 'index.js')
const finalOut = resolve(dist, 'server', 'index.mjs')
if (existsSync(rawOut)) renameSync(rawOut, finalOut)

// ── ③ qw-pages：产物清单 homura.manifest.json ──
// 注意：平台发布时的 entrypoint/port 由受控发布工具的参数决定，并不读这份 manifest
// （推断依据：发布参数里已有 entrypoint/port，且平台对 HTML 只做 chrome 注入）。
// 保留它是作为产物自描述 + 继承旧 app.json 的 SemVer 清单思想，供人/Agent 查阅。
if (isQwPages) {
  const manifest = {
    name: pkg.name,
    version: pkg.version,
    runtime: 'qw-pages',
    entrypoint: 'server/index.mjs',
    assets: 'client/',
    apiVersion: 'v1',
    // 实测运行时常量，便于排查（Node v22.23.1 / cwd=/opt/qwenwork-page/app / 注入 12 个 env）
    measured: {
      nodeVersion: '22.23.1',
      appRoot: '/opt/qwenwork-page/app',
      port: 8081,
      host: '127.0.0.1',
      healthzPath: '/_healthz',
      dataDialect: 'rest',
    },
  }
  writeFileSync(resolve(dist, 'homura.manifest.json'), JSON.stringify(manifest, null, 2))
  console.log('[build] manifest → dist/homura.manifest.json')
}

// ── ④ 部署期配置文件（可选，含密钥）──
// qw-pages 无自定义 env 注入口（实测），SESSION_SECRET / OAUTH_CLIENT_SECRET 只能随产物携带。
// 产物不可被公网读取（实测：/server/*.mjs 与 /homura.manifest.json 均被 SPA fallback 兜成
// index.html，%2e%2e 变体被网关 400），故此通道的信任边界与代码本身相同。
// 运行时定位顺序见 core 的 resolveConfigFilePath：HOMURA_CONFIG_FILE → <cwd> → 平台可写区。
const configSrc = resolve(root, 'config', 'homura.config.env')
if (existsSync(configSrc)) {
  copyFileSync(configSrc, resolve(dist, 'homura.config.env'))
  console.log('[build] config → dist/homura.config.env（含密钥：已被 .gitignore 忽略，勿提交）')
} else if (isQwPages) {
  console.warn(
    '[build] 未找到 config/homura.config.env：qw-pages 上 SESSION_SECRET 会沿用仓库公开的缺省值，' +
      '启用 auth 时会被启动期断言拒绝（见 src/server/env.ts 的 assertSecretsOverridden）',
  )
}

console.log(`[build] done → ${dist}`)
