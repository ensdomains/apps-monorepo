/// <reference types="vitest" />

import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { cloudflare } from '@cloudflare/vite-plugin'
import i18nextLoader from '@ensdomains/vite-plugin-i18next-loader'
import tailwindcss from '@tailwindcss/vite'
import { tanstackRouter } from '@tanstack/router-plugin/vite'
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
    i18nextLoader({ paths: [locales] }),
    tailwindcss(),
    cloudflare(),
  ],
  resolve: {
    alias: {
      '@': new URL('./src', import.meta.url).pathname,
      '@ens-apps/utils': new URL('../../packages/utils/src', import.meta.url)
        .pathname,
    },
  },
})
