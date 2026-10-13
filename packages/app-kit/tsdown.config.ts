import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    serve: 'src/runtime/node.ts',
    'qw-pages': 'src/runtime/qw-pages.ts',
  },
  dts: true,
  format: 'esm',
  target: 'node22',
  clean: true,
  outExtensions: () => ({ js: '.js', dts: '.d.ts' }),
})
