import { defineConfig } from 'vite'

export default defineConfig({
  server: {
    proxy: {
      '/api': {
        target: 'https://borc-flame.vercel.app', 
        changeOrigin: true,
        secure: true,
      }
    }
  }
})
