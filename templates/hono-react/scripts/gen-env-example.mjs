/**
 * 生成配置样例 —— 「配置即文档」：从 configSpecs 的 defineConfig.help() 派生，
 * env 定义与文档永不脱节（改了 env.ts 重跑此脚本即可）。
 *
 * 产出两份（同一份 help，不同抬头）：
 *   .env.example                        —— standalone：真实环境变量
 *   config/homura.config.env.example    —— qw-pages：随产物携带的配置文件（平台无 env 注入口）
 * 用法：pnpm gen:env
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
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

const configHeader = `# homura 部署期配置样例 —— qw-pages 形态的密钥投递通道
# 由 scripts/gen-env-example.mjs 从 src/server/env.ts 的 configSpecs 自动生成
# ⚠ 勿手改：改 env.ts 后重跑 \`pnpm gen:env\`
#
# 用法：复制为 config/homura.config.env（已被 .gitignore 忽略）并填入真实值。
#   \`pnpm build:qw-pages\` 会把它拷进 dist/，随产物部署；
#   运行时由 @homurajs/core 的 applyEnvFile 在 loadConfig 里并入 process.env。
# 优先级：真实环境变量 > 本文件。定位顺序：
#   HOMURA_CONFIG_FILE → <cwd>/homura.config.env → QWENWORK_WRITABLE_DIR/homura.config.env
#
# ⚠ SESSION_SECRET 必须改：仓库里的缺省值是公开字符串，qw-pages / NODE_ENV=production
#   形态下沿用它会被 assertSecretsOverridden 拒绝启动（HS256 密钥公开 = 会话可伪造）
# ⚠ qw-pages 上 DIALECT 不用填（自动解析为 rest）；STORAGE_BACKEND 三个后端都不可用，
#   详见 docs/specs/module-qw-pages.md 与 AGENTS.md 的能力 × 形态支持矩阵

`
const configOut = resolve(import.meta.dirname, '../config/homura.config.env.example')
mkdirSync(dirname(configOut), { recursive: true })
writeFileSync(configOut, configHeader + help + '\n')
console.log(`[gen:env] → ${configOut}`)
