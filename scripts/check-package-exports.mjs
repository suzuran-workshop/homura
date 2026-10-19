#!/usr/bin/env node
/**
 * 发包一致性门禁：package.json 的 exports / publishConfig.exports 必须与 tsdown entry 一一对应，
 * 且构建产物（dist/*.js + dist/*.d.ts）必须真实存在。
 *
 * 为什么需要这个门禁（真实事故）：
 *   26.10.14 / 26.10.15 的 @homurajs/storage 漏发了 ./db、./tables、./chunk-client 三个子路径——
 *   c48f8c1 加 db 后端时更新了 package.json 的 exports，但没同步 tsdown.config.ts 的 entry。
 *   后果是 dist/ 里根本没有 db.js，消费方 `import '@homurajs/storage/db'` 直接 ERR_MODULE_NOT_FOUND。
 *   而 db 后端是 qw-pages 上**唯一**可用的 storage 后端 → Pages 文件存储整个不可用。
 *
 *   这个 bug 能连过两个版本，是因为三层检查全部失明：
 *     ① 开发态 exports 指向 ./src/*.ts（workspace 直连源码），根本不经过 dist；
 *     ② vitest 跑的是 src，48 个测试全绿，测不到产物；
 *     ③ release.yml 只在 publish 前跑 build，不校验 build 出来的东西齐不齐。
 *   只有真正 `npm install` 了发布包的下游才会炸。
 *
 * 两道校验：
 *   A. 静态：publishConfig.exports 的每个 dist 目标 ← 必须有同名 tsdown entry（无需构建即可跑）
 *   B. 产物：dist/ 已存在时，每个目标的 .js 与 .d.ts 必须真的在磁盘上（build 后跑）
 *
 * 用法：node scripts/check-package-exports.mjs [--verbose]
 * 退出码：0 = 全部一致；1 = 有包不一致（打印可行动的修复提示）
 */
import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs'
import { join, basename } from 'node:path'

const REPO_ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
const PACKAGES_DIR = join(REPO_ROOT, 'packages')
const VERBOSE = process.argv.includes('--verbose')

/**
 * 从 tsdown.config.ts 提取 entry 的**输出文件基名**（不含扩展名）。
 *
 * 支持本仓库统一使用的两种形态：
 *   entry: ['src/index.ts']                    → 基名 = index
 *   entry: { index: 'src/index.ts', ... }      → 基名 = key（index / chunk-client / qw-pages）
 *   entry: { 'schema-helpers': 'src/...' }     → 引号 key 同样支持
 *
 * 解析不出任何 entry 时**报错而非静默通过**：门禁失效比没有门禁更危险。
 */
function parseEntryNames(configPath) {
  const src = readFileSync(configPath, 'utf8')
  const m = src.match(
    /entry\s*:\s*([\s\S]*?)(?:,\s*\n\s*(?:dts|format|target|clean|outExtensions|external|noExternal|platform|tsconfig|esbuildOptions|rolldownOptions)\s*:|\n\s*\}\s*\))/,
  )
  if (!m) {
    throw new Error(
      `无法从 ${configPath} 解析 entry 块：tsdown 配置形态可能已变更，` +
        '请同步更新 scripts/check-package-exports.mjs 的解析逻辑（门禁失效比没有门禁更危险）',
    )
  }
  const block = m[1]
  const names = new Set()
  // 对象形态：`key: 'src/x.ts'` 或 `'quoted-key': "src/x.ts"`
  for (const pair of block.matchAll(
    /(?:^|[,{\s])(?:'([^']+)'|"([^"]+)"|([A-Za-z0-9_-]+))\s*:\s*(?:'([^']+)'|"([^"]+)")/g,
  )) {
    const key = pair[1] ?? pair[2] ?? pair[3]
    if (key) names.add(key)
  }
  // 数组形态：`'src/x.ts'`（输出基名 = 文件名去扩展）
  if (names.size === 0) {
    for (const item of block.matchAll(/(?:'([^']+\.ts)'|"([^"]+\.ts)")/g)) {
      const p = item[1] ?? item[2]
      if (p) names.add(basename(p).replace(/\.ts$/, ''))
    }
  }
  if (names.size === 0) {
    throw new Error(`从 ${configPath} 解析出 0 个 entry：配置形态无法识别，门禁拒绝放行`)
  }
  return names
}

/** publishConfig.exports 里每个子路径对应的 dist 目标基名（去 ./dist/ 与 .js） */
function distTargets(pkg) {
  const pub = pkg.publishConfig?.exports
  if (!pub) return []
  const out = []
  for (const [subpath, value] of Object.entries(pub)) {
    // 形态一：{ "./db": "./dist/db.js" }
    // 形态二：{ ".": { types: "./dist/index.d.ts", import: "./dist/index.js" } }
    const files = typeof value === 'string' ? [value] : Object.values(value ?? {})
    for (const f of files) {
      if (typeof f === 'string' && f.startsWith('./dist/')) {
        out.push({
          subpath,
          file: f.replace(/^\.\//, ''),
          base: basename(f).replace(/\.(js|d\.ts)$/, ''),
        })
      }
    }
  }
  // 同一 entry 会有 .js 与 .d.ts 两条目标，按基名去重后逐个校验两类文件
  const byBase = new Map()
  for (const t of out) {
    if (!byBase.has(t.base)) byBase.set(t.base, t)
  }
  return [...byBase.values()]
}

const pkgDirs = readdirSync(PACKAGES_DIR).filter((d) => {
  const p = join(PACKAGES_DIR, d)
  return statSync(p).isDirectory() && existsSync(join(p, 'package.json'))
})

const failures = []
let checkedExports = 0
let checkedFiles = 0

for (const dir of pkgDirs) {
  const root = join(PACKAGES_DIR, dir)
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
  const name = pkg.name ?? dir
  const configPath = join(root, 'tsdown.config.ts')

  if (!existsSync(configPath)) {
    failures.push(`${name}: 缺少 tsdown.config.ts，无法校验 entry 与 exports 的一致性`)
    continue
  }

  let entryNames
  try {
    entryNames = parseEntryNames(configPath)
  } catch (e) {
    failures.push(`${name}: ${e.message}`)
    continue
  }

  const targets = distTargets(pkg)
  if (targets.length === 0) {
    failures.push(
      `${name}: publishConfig.exports 未声明任何 ./dist/ 目标（发包会指向不存在的文件）`,
    )
    continue
  }

  const problems = []
  for (const t of targets) {
    checkedExports++
    // A. 静态一致性：exports 声明了，entry 必须有
    if (!entryNames.has(t.base)) {
      problems.push(
        `exports 子路径 ${t.subpath} → ${t.file}，但 tsdown entry 里没有 "${t.base}"\n` +
          `      修复：在 packages/${dir}/tsdown.config.ts 的 entry 中补 ` +
          `'${t.base}': 'src/${t.base}.ts'`,
      )
      continue
    }
    // B. 产物存在性：build 过就必须真有文件（dist 不存在则跳过，允许 pre-build 校验）
    const distDir = join(root, 'dist')
    if (existsSync(distDir)) {
      for (const ext of ['.js', '.d.ts']) {
        const f = join(distDir, `${t.base}${ext}`)
        checkedFiles++
        if (!existsSync(f)) {
          problems.push(
            `产物缺失：packages/${dir}/dist/${t.base}${ext}（entry 已声明但 build 没产出）`,
          )
        }
      }
    }
  }

  // 反向：entry 有但 exports 没声明 → 产物发不出去（不是致命错误，但通常是漏改 exports）
  const declared = new Set(targets.map((t) => t.base))
  const orphan = [...entryNames].filter((n) => !declared.has(n))
  if (orphan.length > 0) {
    problems.push(
      `tsdown entry 有 ${orphan.map((n) => `"${n}"`).join(', ')}，但 publishConfig.exports 未声明对应子路径\n` +
        `      → 会构建出来却无法被 import（漏改 exports？）`,
    )
  }

  if (problems.length > 0) {
    failures.push(`${name}:\n    - ${problems.join('\n    - ')}`)
  } else if (VERBOSE) {
    console.log(`  ✓ ${name} — ${targets.length} 个子路径一致`)
  }
}

if (VERBOSE) {
  console.log(
    `\n校验 ${pkgDirs.length} 个包 / ${checkedExports} 个 exports 子路径` +
      (checkedFiles > 0 ? ` / ${checkedFiles} 个产物文件` : '（dist 未构建，跳过产物校验）'),
  )
}

if (failures.length > 0) {
  console.error('\n✗ 发包一致性门禁未通过：\n')
  for (const f of failures) console.error(`  ${f}\n`)
  console.error(
    '  背景：exports 声明了但 entry 漏了 → dist 缺文件 → 消费方 import 即 ERR_MODULE_NOT_FOUND，\n' +
      '  而开发态 exports 指向 ./src/*.ts，本地测试与 CI 全绿，只有发布产物是坏的。\n' +
      '  见 scripts/check-package-exports.mjs 头注释（26.10.14/15 storage ./db 漏发事故）。\n',
  )
  process.exit(1)
}

console.log(
  `✓ 发包一致性门禁通过：${pkgDirs.length} 个包 / ${checkedExports} 个 exports 子路径` +
    (checkedFiles > 0 ? ` / ${checkedFiles} 个产物文件` : '（dist 未构建，仅静态校验）'),
)
