import { defineConfig } from 'vite'

export default defineConfig({
  // Proxy removed - client connects directly to server
  // For production: VITE_SERVER_URL points to Render deployment
  // For local dev: Set VITE_SERVER_URL=http://localhost:2567
  build: {
    target: 'es2020',
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true,
        drop_debugger: true
      }
    },
    rollupOptions: {
      output: {
        manualChunks: {
          phaser: ['phaser'],
          colyseus: ['colyseus.js'],
          wallet: ['@coinbase/wallet-sdk', 'viem']
        }
      }
    },
    sourcemap: false,
    chunkSizeWarningLimit: 1000
  },
  server: {
    host: true,
    port: 5173
  }
})
