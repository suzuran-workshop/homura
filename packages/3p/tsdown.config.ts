import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    dingtalk: 'src/dingtalk/index.ts',
  },
  dts: true,
  format: 'esm',
  target: 'node22',
  clean: true,
  outExtensions: () => ({ js: '.js', dts: '.d.ts' }),
})
