import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'schema-helpers': 'src/schema-helpers.ts',
    pg: 'src/pg/index.ts',
  },
  dts: true,
  format: 'esm',
  target: 'node22',
  clean: true,
  outExtensions: () => ({ js: '.js', dts: '.d.ts' }),
})
