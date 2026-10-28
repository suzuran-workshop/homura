import { defineConfig } from 'tsdown'

export default defineConfig({
  // ⚠ entry 必须与 package.json 的 exports / publishConfig.exports **一一对应**：
  //   exports 声明了但 entry 漏了 → dist 里没这个文件 → 消费方 import 即 ERR_MODULE_NOT_FOUND，
  //   而开发态 exports 指向 ./src/*.ts（workspace 直连源码），本地测试全绿、CI 全绿，
  //   只有 npm 发布产物是坏的。一致性由 scripts/check-package-exports.mjs 把守。
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
