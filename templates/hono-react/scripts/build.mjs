/**
 * 构建编排：vite build（前端）+ tsdown（后端 bundle）。
 *
 * 双形态（99% 共用，差异仅 entry + 打包策略 + manifest）：
 *   standalone（默认）：entry=src/server/index.ts，外部化依赖（node_modules 运行时解析）
 *   qw-pages（HOMURA_BUILD_TARGET=qw-pages）：entry=src/server/qw-pages.ts，
 *     自包含单文件（noExternal 全打进 bundle——不赌 qw-pages 侧 npm install），
 *     + 根部 homura.manifest.json（继承旧 app.json 的 SemVer 清单思想）
 *
 * qw-pages 约定确认后，只需改此文件与 src/server/qw-pages.ts（见 docs/specs/module-qw-pages）。
 */
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs'
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
// 关键：@homura/* 是源码直出包（exports → src/*.ts），external 化后运行时
// 会去 import .ts 而崩溃，故两个形态都必须打包 @homura/*。
//   standalone：只打包 @homura/*，第三方（drizzle/hono/postgres）走运行时 node_modules
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
  noExternal: isQwPages ? [/.*/] : [/^@homura\//],
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
if (isQwPages) {
  const manifest = {
    name: pkg.name,
    version: pkg.version,
    runtime: 'qw-pages',
    entrypoint: 'server/index.mjs',
    assets: 'client/',
    apiVersion: 'v1',
  }
  writeFileSync(resolve(dist, 'homura.manifest.json'), JSON.stringify(manifest, null, 2))
  console.log('[build] manifest → dist/homura.manifest.json')
}

console.log(`[build] done → ${dist}`)
