/// <reference types="vitest" />

import { cloudflare } from '@cloudflare/vite-plugin'
import { NodeGlobalsPolyfillPlugin } from '@esbuild-plugins/node-globals-polyfill'
import tailwindcss from '@tailwindcss/vite'
import { tanstackRouter } from '@tanstack/router-plugin/vite'
import viteReact from '@vitejs/plugin-react-swc'
import { defineConfig } from 'vite'

import { nodePolyfills } from 'vite-plugin-node-polyfills'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    nodePolyfills(),
    tanstackRouter({
      autoCodeSplitting: true,
      routeFileIgnorePattern: '.((css|const).ts)',
    }),
    viteReact(),
    tailwindcss(),
    cloudflare(),
  ],
  test: {
    globals: true,
    environment: 'happy-dom',
    coverage: {
      provider: 'v8',
      reporter: ['lcovonly', 'text', 'html'],
    },
  },
  resolve: {
    alias: {
      '@': new URL('./src', import.meta.url).pathname,
      '@ens-apps/utils': new URL('../../packages/utils/src', import.meta.url)
        .pathname,
      buffer: 'buffer',
    },
  },
  optimizeDeps: {
    esbuildOptions: {
      define: {
        global: 'globalThis',
      },
      plugins: [
        NodeGlobalsPolyfillPlugin({
          buffer: true,
        }),
      ],
    },
  },
})
