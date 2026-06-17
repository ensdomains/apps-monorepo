/// <reference types="vitest" />

import { fileURLToPath } from 'node:url'
import { lingui, linguiTransformerBabelPreset } from '@lingui/vite-plugin'
import babel from '@rolldown/plugin-babel'
import viteReact from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [
    viteReact(),
    lingui(),
    babel({
      presets: [linguiTransformerBabelPreset()],
    }),
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
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      // Tests exercise the default (RainbowKit) wallet stack; the real vendor
      // is chosen at build time in vite.config.ts via VITE_FF_USE_PRIVY.
      'active-wallet-stack': fileURLToPath(
        new URL('./src/lib/wallet/stacks/RainbowKitStack.tsx', import.meta.url),
      ),
    },
  },
  define: {
    global: 'globalThis',
    'process.env': {},
    'import.meta.env': {},
  },
})
