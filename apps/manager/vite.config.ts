/// <reference types="vitest" />

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
  test: {
    globals: true,
    environment: 'happy-dom',
    setupFiles: ['./src/utils/test-utils.tsx'],
    coverage: {
      provider: 'v8',
      reporter: ['lcovonly', 'text', 'html'],
    },
    server: {
      deps: {
        inline: ['tiny-warning'],
      },
    },
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  define: {
    global: 'globalThis',
    'process.env': {},
    module: 'globalThis',
  },
})
