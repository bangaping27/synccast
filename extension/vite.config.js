import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { crx } from '@crxjs/vite-plugin'
import manifest from './manifest.json'

export default defineConfig({
  plugins: [
    react(),
    crx({ manifest }),
  ],
  build: {
    emptyOutDir: true,
    rollupOptions: {
      input: {
        popup: 'index.html',
      },
    },
  },
  server: {
    strictPort: true,
    port: 5173,
    hmr: {
      clientPort: 5173,
    },
    cors: true,
    headers: {
      "Access-Control-Allow-Origin": "*",
    },
  },
})
