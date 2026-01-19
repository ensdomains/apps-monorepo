/// <reference types="vitest" />

import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'happy-dom',
    setupFiles: ['./src/utils/test-utils.tsx'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'clover', 'json', 'lcovonly'],
      exclude: [
        'node_modules/',
        'src/utils/test-utils.tsx',
        '**/*.test.{ts,tsx}',
        '**/*.spec.{ts,tsx}',
        '**/*.d.ts',
        '**/routeTree.gen.ts',
        'vite.config.ts',
        'vitest.config.ts',
        '.vinxi/',
        '.output/',
      ],
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
