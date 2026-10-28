import { afterEach, describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { CONFIG_FILE_NAME, applyEnvFile, parseEnvFile, resolveConfigFilePath } from './env-file.js'

const dirs: string[] = []
function tmpWith(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'homura-envfile-'))
  dirs.push(dir)
  for (const [name, text] of Object.entries(files)) writeFileSync(join(dir, name), text)
  return dir
}
afterEach(() => {
  while (dirs.length > 0) {
    const d = dirs.pop()
    if (d) rmSync(d, { recursive: true, force: true })
  }
})

describe('parseEnvFile', () => {
  it('KEY=VALUE、注释、空行、export 前缀', () => {
    expect(
      parseEnvFile(
        [
          '# 注释行',
          '',
          '  ',
          'A=1',
          'export B=2',
          '  C = 3  ', // 键与值两侧空白都吃掉
        ].join('\n'),
      ),
    ).toEqual({ A: '1', B: '2', C: '3' })
  })

  it('单引号字面量（不解析转义）与双引号（解析转义）', () => {
    const parsed = parseEnvFile(["S='a\\nb#'", 'D="a\\nb\\t\\"q\\\\"'].join('\n'))
    expect(parsed['S']).toBe('a\\nb#')
    expect(parsed['D']).toBe('a\nb\t"q\\')
  })

  it('无引号值去掉行尾内联注释，但保留值中间的 #', () => {
    expect(parseEnvFile('A=secret # 这是注释\nB=pass#word\n')).toEqual({
      A: 'secret',
      B: 'pass#word',
    })
  })

  it('同名键后者覆盖前者', () => {
    expect(parseEnvFile('A=1\nA=2')).toEqual({ A: '2' })
  })

  it('空值合法（用于显式关闭某能力）', () => {
    expect(parseEnvFile('STORAGE_BACKEND=')).toEqual({ STORAGE_BACKEND: '' })
  })

  it('非法行 fail fast 并带行号', () => {
    expect(() => parseEnvFile('A=1\n不是配置\n')).toThrow(/第 2 行/)
    expect(() => parseEnvFile('A=1\n1BAD=x\n')).toThrow(/变量名非法/)
    expect(() => parseEnvFile('=novalue')).toThrow(/第 1 行/)
  })
})

describe('resolveConfigFilePath — 优先级', () => {
  it('显式 path 最优先', () => {
    const dir = tmpWith({ [CONFIG_FILE_NAME]: 'A=1', 'other.env': 'B=2' })
    expect(resolveConfigFilePath({}, { path: join(dir, 'other.env') })).toBe(join(dir, 'other.env'))
  })

  it('HOMURA_CONFIG_FILE 次之（相对路径按 cwd 解析）', () => {
    const dir = tmpWith({ 'custom.env': 'A=1' })
    expect(resolveConfigFilePath({ HOMURA_CONFIG_FILE: 'custom.env' }, { cwd: dir })).toBe(
      join(dir, 'custom.env'),
    )
  })

  it('再次是 <cwd>/homura.config.env（= 产物根）', () => {
    const dir = tmpWith({ [CONFIG_FILE_NAME]: 'A=1' })
    expect(resolveConfigFilePath({}, { cwd: dir })).toBe(join(dir, CONFIG_FILE_NAME))
  })

  it('extraDirs 兜底（不改产物即可投放/轮换配置）', () => {
    const cwdDir = tmpWith({})
    const extra = tmpWith({ [CONFIG_FILE_NAME]: 'A=from-extra' })
    expect(resolveConfigFilePath({}, { cwd: cwdDir, extraDirs: [extra] })).toBe(
      join(extra, CONFIG_FILE_NAME),
    )
  })

  it('都不存在 → null（零配置也能跑）', () => {
    expect(resolveConfigFilePath({}, { cwd: tmpWith({}) })).toBeNull()
  })
})

describe('applyEnvFile', () => {
  it('并入 env 并报告 applied', () => {
    const dir = tmpWith({ [CONFIG_FILE_NAME]: 'SESSION_SECRET=s1\nOAUTH_CLIENT_SECRET=o1\n' })
    const env: NodeJS.ProcessEnv = {}
    const r = applyEnvFile(env, { cwd: dir })
    expect(r.path).toBe(join(dir, CONFIG_FILE_NAME))
    expect(r.applied.sort()).toEqual(['OAUTH_CLIENT_SECRET', 'SESSION_SECRET'])
    expect(env['SESSION_SECRET']).toBe('s1')
  })

  it('真实 env 优先于文件（override=false，缺省）', () => {
    const dir = tmpWith({ [CONFIG_FILE_NAME]: 'A=from-file\nB=from-file\n' })
    const env: NodeJS.ProcessEnv = { A: 'from-env' }
    const r = applyEnvFile(env, { cwd: dir })
    expect(env['A']).toBe('from-env')
    expect(env['B']).toBe('from-file')
    expect(r.skipped).toEqual(['A'])
    expect(r.applied).toEqual(['B'])
  })

  it('override=true 时文件覆盖真实 env', () => {
    const dir = tmpWith({ [CONFIG_FILE_NAME]: 'A=from-file\n' })
    const env: NodeJS.ProcessEnv = { A: 'from-env' }
    applyEnvFile(env, { cwd: dir, override: true })
    expect(env['A']).toBe('from-file')
  })

  it('空字符串的真实 env 视为未设置（可被文件填充）', () => {
    const dir = tmpWith({ [CONFIG_FILE_NAME]: 'A=from-file\n' })
    const env: NodeJS.ProcessEnv = { A: '' }
    applyEnvFile(env, { cwd: dir })
    expect(env['A']).toBe('from-file')
  })

  it('没有配置文件时不动 env，path 为 null', () => {
    const env: NodeJS.ProcessEnv = { A: '1' }
    const r = applyEnvFile(env, { cwd: tmpWith({}) })
    expect(r).toEqual({ path: null, applied: [], skipped: [] })
    expect(env).toEqual({ A: '1' })
  })

  it('配置写错时抛错而不是静默忽略', () => {
    const dir = tmpWith({ [CONFIG_FILE_NAME]: 'SESSION_SECRET=s1\n这行是错的\n' })
    expect(() => applyEnvFile({}, { cwd: dir })).toThrow(/第 2 行/)
  })
})
