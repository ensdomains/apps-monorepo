/// <reference types="vitest" />

import path from 'node:path'
import { TanStackRouterVite } from '@tanstack/router-plugin/vite'
import { vanillaExtractPlugin } from '@vanilla-extract/vite-plugin'
import viteReact from '@vitejs/plugin-react-swc'
import { defineConfig } from 'vite'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    TanStackRouterVite({
      autoCodeSplitting: true,
      routeFileIgnorePattern: '.((css|const).ts)',
    }),
    viteReact(),
    vanillaExtractPlugin(),
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
      '@ens-apps/hooks': new URL('../../packages/hooks/src', import.meta.url).pathname,
      '@ens-apps/utils': new URL('../../packages/utils/src', import.meta.url).pathname,
    },
  },
})
