import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Relative base so the built dashboard works when served from /dashboard.
export default defineConfig({
  plugins: [react()],
  base: './',
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:8080',
    },
  },
})