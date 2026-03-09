import { fileURLToPath } from 'node:url'
import { cloudflare } from '@cloudflare/vite-plugin'
import tailwindcss from '@tailwindcss/vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vitejs.dev/config/
export default defineConfig({
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:2999',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
      // Local E2E: proxy bundler + paymaster to avoid CORS.
      // Set VITE_PIMLICO_BUNDLER_URL=/bundler and VITE_PAYMASTER_URL=/paymaster
      '/bundler': {
        target: 'http://127.0.0.1:4337',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/bundler/, ''),
      },
      '/paymaster': {
        target: 'http://127.0.0.1:3002',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/paymaster/, ''),
      },
    },
  },
  plugins: [
    cloudflare({
      viteEnvironment: { name: 'ssr' },
    }),
    tanstackStart(),
    viteReact(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})
