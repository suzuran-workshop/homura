import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    local: 'src/local.ts',
    s3: 'src/s3.ts',
    supabase: 'src/supabase.ts',
    proxy: 'src/proxy.ts',
  },
  dts: true,
  format: 'esm',
  target: 'node22',
  clean: true,
  outExtensions: () => ({ js: '.js', dts: '.d.ts' }),
})
