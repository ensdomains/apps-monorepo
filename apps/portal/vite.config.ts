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
      autoCodeSplitting: false, // Disable to prevent provider context issues in production
      routeFileIgnorePattern: '.((css|const).ts)',
    }),
    viteReact(),
    i18nextLoader({ paths: [locales] }),
    tailwindcss(),
    cloudflare(),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@ens-apps/utils': fileURLToPath(
        new URL('../../packages/utils/src', import.meta.url),
      ),
      '@ens-apps/l2-primary': new URL(
        '../../packages/l2-primary/src',
        import.meta.url,
      ).pathname,
    },
    dedupe: ['react', 'react-dom', 'wagmi', '@wagmi/core'],
  },
  optimizeDeps: {
    exclude: ['@ens-apps/l2-primary'],
    include: [
      'react',
      'react-dom',
      'wagmi',
      '@wagmi/core',
      '@rainbow-me/rainbowkit',
    ],
  },
  build: {
    commonjsOptions: {
      include: [/node_modules/],
    },
    rollupOptions: {
      output: {
        manualChunks: undefined, // Let Vite handle chunking automatically without aggressive splitting
      },
    },
  },
})
