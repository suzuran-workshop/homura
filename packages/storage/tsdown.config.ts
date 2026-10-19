import { defineConfig } from 'tsdown'

export default defineConfig({
  // ⚠ entry 必须与 package.json 的 exports / publishConfig.exports **一一对应**：
  //   exports 声明了但 entry 漏了 → dist 里没这个文件 → 消费方 import 即 ERR_MODULE_NOT_FOUND，
  //   而开发态 exports 指向 ./src/*.ts（workspace 直连源码），本地测试全绿、CI 全绿，
  //   只有 npm 发布产物是坏的。26.10.14/15 的 ./db ./tables ./chunk-client 就是这样漏发的
  //   （db 后端是 qw-pages 上唯一可用的 storage，漏发等于 Pages 文件存储整个不可用）。
  //   一致性由 scripts/check-package-exports.mjs 把守（test.yml 静态校验 + release.yml 产物校验）。
  entry: {
    index: 'src/index.ts',
    local: 'src/local.ts',
    s3: 'src/s3.ts',
    supabase: 'src/supabase.ts',
    db: 'src/db.ts',
    tables: 'src/tables.ts',
    'chunk-client': 'src/chunk-client.ts',
    proxy: 'src/proxy.ts',
  },
  dts: true,
  format: 'esm',
  target: 'node22',
  clean: true,
  outExtensions: () => ({ js: '.js', dts: '.d.ts' }),
})
