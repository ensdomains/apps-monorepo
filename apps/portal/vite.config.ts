/// <reference types="vitest" />

import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import i18nextLoader from '@ensdomains/vite-plugin-i18next-loader'
import { tanstackRouter } from '@tanstack/router-plugin/vite'
import { vanillaExtractPlugin } from '@vanilla-extract/vite-plugin'
import viteReact from '@vitejs/plugin-react-swc'
import { defineConfig } from 'vite'

const locales = dirname(
  fileURLToPath(import.meta.resolve('@ensdomains/locales')),
)

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    tanstackRouter({
      autoCodeSplitting: true,
      routeFileIgnorePattern: '.((css|const).ts)',
    }),
    viteReact(),
    vanillaExtractPlugin(),
    i18nextLoader({ paths: [locales] }),
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
    },
  },
})
