import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/** SPA fallback: serve index.html for routes like /worker so client-side router can handle them. */
function spaFallbackPlugin() {
  return {
    name: 'spa-fallback',
    configurePreviewServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url || ''
        if (url.startsWith('/api') || url.startsWith('/ws') || url.startsWith('/assets')) return next()
        if (url.includes('.')) return next() // file with extension
        if (url === '/' || url === '') return next()
        req.url = '/'
        next()
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), spaFallbackPlugin()],
  server: {
    port: 5173,
    host: true, // listen on all interfaces so phone on same LAN can open http://YOUR_IP:5173
    proxy: {
      '/api': 'http://localhost:8000',
      '/ws': {
        target: 'ws://localhost:8000',
        ws: true,
      },
    },
  },
  preview: {
    port: 5173,
    host: true, // so phone can load http://YOUR_IP:5173 after build
    proxy: {
      '/api': 'http://localhost:8000',
      '/ws': { target: 'ws://localhost:8000', ws: true },
    },
  },
})
