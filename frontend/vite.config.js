import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  define: {
    // Injected as a compile-time constant, used by Sentry release tracking in main.jsx
    __APP_VERSION__: JSON.stringify(process.env.npm_package_version || '1.0.0'),
  },
  server: {
    port: 3000,
    proxy: {
      '/api': 'http://localhost:5000',
      '/admin/api': 'http://localhost:5000',
    }
  },
  build: {
    // Always output to dist — Vercel picks this up via outputDirectory in vercel.json.
    // For local backend-served builds, copy dist/ to backend/public/ manually.
    outDir: 'dist',
    emptyOutDir: true,
  }
})
