import { defineConfig } from 'vite'

export default defineConfig({
  // Proxy removed - client connects directly to server
  // For production: VITE_SERVER_URL points to Render deployment
  // For local dev: Set VITE_SERVER_URL=http://localhost:2567
})
