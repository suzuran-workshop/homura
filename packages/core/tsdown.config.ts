import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['src/index.ts'],
  dts: true,
  format: 'esm',
  target: 'node22',
  clean: true,
  outExtensions: () => ({ js: '.js', dts: '.d.ts' }),
})
