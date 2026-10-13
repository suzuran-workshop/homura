import { defineConfig } from 'tsdown'

export default defineConfig({
  // hono 子路径的源文件是 guard.ts（停服守卫中间件）
  entry: {
    index: 'src/index.ts',
    contract: 'src/contract.ts',
    tables: 'src/tables.ts',
    hono: 'src/guard.ts',
  },
  dts: true,
  format: 'esm',
  target: 'node22',
  clean: true,
  outExtensions: () => ({ js: '.js', dts: '.d.ts' }),
})
