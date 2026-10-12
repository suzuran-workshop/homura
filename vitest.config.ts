import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // vitest 3：workspace 文件已弃用，projects 取代之
    projects: ['packages/*', 'templates/*'],
  },
})
