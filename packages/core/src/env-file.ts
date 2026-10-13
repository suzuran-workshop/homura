/**
 * 部署期配置文件加载（KEY=VALUE 行格式，dotenv 语义子集，零依赖）。
 *
 * 为什么需要它：qw-pages 平台只注入固定 12 个 env，且**没有自定义 env/secret 注入口**
 * （实测），故 SESSION_SECRET / OAUTH_CLIENT_SECRET 这类值无法用环境变量投递。
 * 而部署产物本身不可被公网读取（实测：请求 /server/*.mjs、/homura.manifest.json 一律被
 * SPA fallback 兜成 index.html，%2e%2e 变体被网关 400，而真实 /assets/*.js 正常返回），
 * 所以「随产物携带一个配置文件」是可行的投递通道，其信任边界与代码本身相同。
 *
 * 为什么是 env 行格式而不是 yaml/json：整个配置面已经是 env 形状（configSpecs +
 * defineConfig），把文件内容并进 process.env 后能力包零改动，也不需要引解析器。
 * 需要 yaml 时再加一个 source 适配即可，属加法而非改造。
 *
 * 优先级：**真实 env > 文件**（override=false，缺省）。standalone 仍可用环境变量覆盖，
 * 与 12-factor 习惯一致；也便于本地调试时临时改一个值而不编辑文件。
 */
import { existsSync, readFileSync } from 'node:fs'
import { isAbsolute, resolve } from 'node:path'

const KEY_RE = /^[A-Za-z_][A-Za-z0-9_]*$/

/** 配置文件名（缺省）；产物根 = 运行时 cwd，故 <cwd>/homura.config.env 即随产物携带的那份 */
export const CONFIG_FILE_NAME = 'homura.config.env'

/**
 * 解析 KEY=VALUE 行格式。
 * - 跳过空行与 `#` 注释行；支持 `export KEY=VALUE`
 * - 单引号：字面量，不解析转义；双引号：解析 \n \t \r \" \\ 转义
 * - 无引号：去掉行尾 ` #...` 内联注释（前必须有空白），并 trim
 * - 同名键后者覆盖前者
 * - 非法行抛错并带上行号（fail fast：配置写错不该静默忽略）
 */
export function parseEnvFile(text: string): Record<string, string> {
  const out: Record<string, string> = {}
  const lines = text.split(/\r?\n/)
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i] ?? ''
    const line = raw.trim()
    if (line === '' || line.startsWith('#')) continue
    const body = line.startsWith('export ') ? line.slice('export '.length).trim() : line
    const eq = body.indexOf('=')
    if (eq <= 0) {
      throw new Error(`配置文件第 ${i + 1} 行不是 KEY=VALUE：${raw.slice(0, 80)}`)
    }
    const key = body.slice(0, eq).trim()
    if (!KEY_RE.test(key)) {
      throw new Error(`配置文件第 ${i + 1} 行的变量名非法：${key}`)
    }
    out[key] = unquote(body.slice(eq + 1).trim())
  }
  return out
}

function unquote(value: string): string {
  if (value.length >= 2 && value.startsWith("'") && value.endsWith("'")) {
    return value.slice(1, -1)
  }
  if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) {
    return value
      .slice(1, -1)
      .replace(/\\([nrt"\\])/g, (_m, c: string) =>
        c === 'n' ? '\n' : c === 'r' ? '\r' : c === 't' ? '\t' : c,
      )
  }
  // 无引号：去掉行尾内联注释（` #` 之后），不碰值中间的 #
  const hash = value.search(/\s#/)
  return (hash === -1 ? value : value.slice(0, hash)).trim()
}

export interface ResolveConfigFileOptions {
  /** 显式路径（绝对或相对 cwd）；缺省读 env.HOMURA_CONFIG_FILE */
  path?: string
  cwd?: string
  /** 额外候选目录（缺省会追加 QWENWORK_WRITABLE_DIR，即平台唯一可写区） */
  extraDirs?: string[]
}

/**
 * 定位配置文件，按优先级返回第一个存在的：
 * 1. 显式 path / `HOMURA_CONFIG_FILE`
 * 2. `<cwd>/homura.config.env`（= 部署产物根，随产物携带的那份）
 * 3. `<QWENWORK_WRITABLE_DIR>/homura.config.env`（平台可写区：可在不改产物的情况下投放/轮换）
 * 4. extraDirs 下的同名文件
 * 都不存在返回 null（零配置也能跑——渐进式）。
 */
export function resolveConfigFilePath(
  env: NodeJS.ProcessEnv,
  opts: ResolveConfigFileOptions = {},
): string | null {
  const cwd = opts.cwd ?? process.cwd()
  const explicit = opts.path ?? env['HOMURA_CONFIG_FILE']
  const candidates: string[] = []
  if (explicit) candidates.push(isAbsolute(explicit) ? explicit : resolve(cwd, explicit))
  candidates.push(resolve(cwd, CONFIG_FILE_NAME))
  const writable = env['QWENWORK_WRITABLE_DIR']
  if (writable) candidates.push(resolve(writable, CONFIG_FILE_NAME))
  for (const dir of opts.extraDirs ?? []) candidates.push(resolve(dir, CONFIG_FILE_NAME))
  return candidates.find((p) => existsSync(p)) ?? null
}

export interface ApplyEnvFileOptions extends ResolveConfigFileOptions {
  /** true 时文件值覆盖已有 env（缺省 false：真实 env 优先） */
  override?: boolean
}

export interface ApplyEnvFileResult {
  /** 实际使用的文件路径；null = 没有配置文件（零配置运行） */
  path: string | null
  /** 写入 env 的变量名 */
  applied: string[]
  /** 因已有真实 env 而跳过的变量名 */
  skipped: string[]
}

/**
 * 把配置文件并入 env（就地修改传入对象，通常就是 process.env）。
 * 必须在 defineConfig(...).load(env) **之前**调用。
 */
export function applyEnvFile(
  env: NodeJS.ProcessEnv,
  opts: ApplyEnvFileOptions = {},
): ApplyEnvFileResult {
  const path = resolveConfigFilePath(env, opts)
  if (!path) return { path: null, applied: [], skipped: [] }
  const values = parseEnvFile(readFileSync(path, 'utf8'))
  const applied: string[] = []
  const skipped: string[] = []
  for (const [key, value] of Object.entries(values)) {
    const existing = env[key]
    if (!opts.override && existing !== undefined && existing !== '') {
      skipped.push(key)
      continue
    }
    env[key] = value
    applied.push(key)
  }
  return { path, applied, skipped }
}
