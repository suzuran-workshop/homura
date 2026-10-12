import { defineConfig } from 'vitest/config'

/**
 * 模板测试配置：root 指向模板目录（区别于 vite.config.ts 的 src/client 构建 root），
 * 覆盖 src 单测（schema parity）与 e2e 冒烟。
 */
export default defineConfig({
  test: {
    root: import.meta.dirname,
    include: ['src/**/*.test.ts', 'e2e/**/*.test.ts'],
    environment: 'node',
  },
})
