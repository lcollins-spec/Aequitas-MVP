import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(() => {
  return {
    plugins: [react()],
    // Dev server proxy: forward API requests to the backend running on port
    // 5001. This allows the frontend to use a relative /api/v1 path in
    // development while the backend runs on a separate port.
    server: {
      port: 5173,
      proxy: {
        '/api': {
          // Allow overriding backend URL with BACKEND_URL env var for local
          // development. Default to port 5002 which the backend is commonly
          // started with in this workspace (see backend/run.py invocation).
          target: process.env.BACKEND_URL || 'http://localhost:5001',
          changeOrigin: true,
          secure: false,
        },
      },
    },
  }
})
