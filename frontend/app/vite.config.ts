import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    proxy: {
      '/api': {
        target: 'http://localhost:8888',
        changeOrigin: true,
      },
      '/oauth': {
        target: 'http://localhost:8888',
        changeOrigin: true,
      },
      '/oobe': {
        target: 'http://localhost:8888',
        changeOrigin: true,
      },
      '/mcp': {
        target: 'http://localhost:8888',
        changeOrigin: true,
      },
    },
  },
})
