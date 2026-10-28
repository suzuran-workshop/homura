/**
 * 构建编排：vite build（前端）+ tsdown（后端 bundle）。
 *
 * standalone：entry=src/server/index.ts，外部化第三方依赖（node_modules 运行时解析），
 * 只打包 @homurajs/*（源码直出包，external 化后运行时会去 import .ts 而崩溃）。
 *
 * ⚠ 产物不是「单文件」：tsdown/rolldown 会代码分割。自包含性仍然成立——真实 import 语句里的
 *   裸包只剩 Node 内置。校验时别用宽松的 grep：drizzle 源码 JSDoc 里有
 *   `* import { union } from 'drizzle-orm/pg-core'` 这类示例文本会误报。
 */
import { execFileSync } from 'node:child_process'
import { readFileSync, existsSync, copyFileSync, renameSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'
import { build } from 'tsdown'

const root = resolve(import.meta.dirname, '..')
const dist = resolve(root, 'dist')

const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf-8'))

// 清理旧产物
rmSync(dist, { recursive: true, force: true })

// ── ① 前端：vite build → dist/client ──
console.log('[build] client (vite)...')
execFileSync(process.execPath, [resolve(root, 'node_modules/vite/bin/vite.js'), 'build'], {
  cwd: root,
  stdio: 'inherit',
})

// ── ② 后端：tsdown → dist/server/index.mjs ──
const entry = 'src/server/index.ts'
console.log(`[build] server (tsdown, entry=${entry})...`)
await build({
  // entry 对象语法固定输出文件名为 index（扩展名由 tsdown 定，稍后统一 rename 为 .mjs）
  entry: { index: resolve(root, entry) },
  outDir: resolve(dist, 'server'),
  format: 'esm',
  target: 'node22',
  platform: 'node',
  noExternal: [/^@homurajs\//],
  // 禁用配置文件自动加载（否则 tsdown 误读 vite/vitest.config 触发 define 警告）
  config: false,
  clean: false,
  sourcemap: false,
  minify: false,
})

// tsdown ESM 产出 index.js；统一 rename 为 index.mjs（明确 ESM）
const rawOut = resolve(dist, 'server', 'index.js')
const finalOut = resolve(dist, 'server', 'index.mjs')
if (existsSync(rawOut)) renameSync(rawOut, finalOut)

// ── ③ 部署期配置文件（可选，含密钥）──
// 产物不可被公网读取（静态中间件只服务 client/，/server/* 与 /homura.config.env 均被
// SPA fallback 兜成 index.html 或 404），故此通道的信任边界与代码本身相同。
// 运行时定位顺序见 core 的 resolveConfigFilePath：HOMURA_CONFIG_FILE → <cwd> → 可写区。
const configSrc = resolve(root, 'config', 'homura.config.env')
if (existsSync(configSrc)) {
  copyFileSync(configSrc, resolve(dist, 'homura.config.env'))
  console.log('[build] config → dist/homura.config.env（含密钥：已被 .gitignore 忽略，勿提交）')
}

console.log(`[build] done → ${dist}`)
