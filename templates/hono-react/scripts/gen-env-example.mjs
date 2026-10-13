/**
 * 生成 .env.example —— 「配置即文档」：从 configSpecs 的 defineConfig.help() 派生，
 * env 定义与文档永不脱节（改了 env.ts 重跑此脚本即可）。
 * 用法：pnpm gen:env
 */
import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig } from '@homurajs/core'
import { configSpecs } from '../src/server/env.ts'

const help = defineConfig(configSpecs).help()
const header = `# homura template 环境变量样例
# 由 scripts/gen-env-example.mjs 从 src/server/env.ts 的 configSpecs 自动生成
# ⚠ 勿手改：改 env.ts 后重跑 \`pnpm gen:env\`
#
# 渐进式：只填你要启用的能力对应的变量，其余留空即不启用该能力

`
const out = resolve(import.meta.dirname, '../.env.example')
writeFileSync(out, header + help + '\n')
console.log(`[gen:env] → ${out}`)
