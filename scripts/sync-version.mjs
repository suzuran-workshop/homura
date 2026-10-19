#!/usr/bin/env node
/**
 * 版本同步：把根 package.json 的 version 写入所有需要发布的子包。
 *
 * 根版本是**唯一权威**（single source of truth）。子包的 version 字段是派生产物，
 * 任何人都不该手工编辑——改版本只改根 package.json，然后跑本脚本。
 *
 * 为什么子包还必须保留 version 字段（不能直接删）：
 *   pnpm publish 硬性要求，缺失即 `ERR_PNPM_PACKAGE_VERSION_NOT_FOUND`
 *   → "Package version is not defined in the package.json."（2026-10-19 实测）。
 *   所以形态是"根写死、子派生"，而非"子包没有版本"。
 *
 * 同步范围：packages/* 里非 private 且有 name 的包（真正会发到 npm 的那些）。
 * private 包（templates/hono-react、docs/homura-docs）不发布，保持原样不动。
 *
 * 用法：
 *   node scripts/sync-version.mjs            # 校验 + 写入（漂移时修改文件，退出 0）
 *   node scripts/sync-version.mjs --check    # 只校验不写入（漂移则退出 1，CI 门禁用）
 */
import { readdirSync, readFileSync, writeFileSync, statSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const REPO_ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
const CHECK_ONLY = process.argv.includes('--check')
const VERBOSE = process.argv.includes('--verbose') || !CHECK_ONLY

const rootPjPath = join(REPO_ROOT, 'package.json')
const rootPj = JSON.parse(readFileSync(rootPjPath, 'utf8'))
const ROOT_VERSION = rootPj.version

if (!ROOT_VERSION) {
  console.error('✗ 根 package.json 没有 version 字段，无法作为权威版本源')
  process.exit(1)
}

/** CalVer（YY.MM.DD）格式校验：与 release.yml 的门禁同源 */
const CALVER_RE = /^[0-9]{2}\.[0-9]{1,2}\.[0-9]{1,2}$/
if (!CALVER_RE.test(ROOT_VERSION)) {
  console.error(`✗ 根版本 ${ROOT_VERSION} 不符合 CalVer（YY.MM.DD）格式`)
  process.exit(1)
}

const packagesDir = join(REPO_ROOT, 'packages')
const targets = readdirSync(packagesDir)
  .filter((d) => {
    const pj = join(packagesDir, d, 'package.json')
    return statSync(join(packagesDir, d)).isDirectory() && existsSync(pj)
  })
  .map((d) => ({
    dir: d,
    path: join(packagesDir, d, 'package.json'),
    pj: JSON.parse(readFileSync(join(packagesDir, d, 'package.json'), 'utf8')),
  }))
  // 只同步会发布的包：private 的不进 npm，版本无意义
  .filter((t) => t.pj.private !== true && t.pj.name?.startsWith('@homurajs/'))

if (targets.length === 0) {
  console.error('✗ packages/ 下没有找到任何待发布的 @homurajs/* 包')
  process.exit(1)
}

const drifted = targets.filter((t) => t.pj.version !== ROOT_VERSION)

if (VERBOSE) {
  console.log(`权威版本（根 package.json）: ${ROOT_VERSION}`)
  console.log(`待同步的发布包: ${targets.length} 个`)
  if (drifted.length > 0) {
    console.log(`版本漂移: ${drifted.length} 个`)
    for (const t of drifted)
      console.log(`  - ${t.pj.name}: ${t.pj.version ?? '(缺失)'} → ${ROOT_VERSION}`)
  } else {
    console.log('版本漂移: 0 个（全部已同步）')
  }
}

if (CHECK_ONLY) {
  if (drifted.length > 0) {
    console.error(
      `\n✗ 版本同步门禁未通过：${drifted.length} 个包的 version 与根版本 ${ROOT_VERSION} 不一致。\n` +
        '  修复：node scripts/sync-version.mjs\n' +
        '  约定：改版本只改根 package.json 的 version，然后跑同步脚本；不要手工编辑子包版本。\n',
    )
    process.exit(1)
  }
  console.log(`✓ 版本同步门禁通过：${targets.length} 个包全部等于根版本 ${ROOT_VERSION}`)
  process.exit(0)
}

let written = 0
for (const t of drifted) {
  // 保持字段顺序：只替换 version 的值，用正则原地改，避免 JSON.stringify 重排整个文件
  const raw = readFileSync(t.path, 'utf8')
  let next
  if (t.pj.version === undefined) {
    // 没有 version 字段：插在 name 之后（npm 惯例顺序）
    next = raw.replace(/("name"\s*:\s*"[^"]+")/, `$1,\n  "version": "${ROOT_VERSION}"`)
  } else {
    next = raw.replace(/("version"\s*:\s*)"[^"]*"/, `$1"${ROOT_VERSION}"`)
  }
  if (next === raw) {
    console.error(`✗ ${t.pj.name}: 无法定位 version 字段做原地替换（文件格式异常）`)
    process.exit(1)
  }
  writeFileSync(t.path, next)
  written++
}

console.log(
  written > 0
    ? `✓ 已把 ${written} 个包的 version 同步为 ${ROOT_VERSION}`
    : `✓ 无需改动：${targets.length} 个包已全部等于 ${ROOT_VERSION}`,
)
