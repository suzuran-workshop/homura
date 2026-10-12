import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// 约定前缀 + dev proxy：前端零 CORS（沿用 Suzuran 惯例）
export default defineConfig({
  root: 'src/client',
  plugins: [react()],
  build: {
    outDir: '../../dist/client',
    emptyOutDir: true,
  },
  server: {
    proxy: {
      '/api': 'http://localhost:3000',
      '/auth': 'http://localhost:3000',
      '/files': 'http://localhost:3000',
    },
  },
})
