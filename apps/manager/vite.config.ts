/// <reference types="vitest" />

import { fileURLToPath } from 'node:url'
import { cloudflare } from '@cloudflare/vite-plugin'
import tailwindcss from '@tailwindcss/vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import type { Plugin } from 'vite'
import { defineConfig } from 'vite'

// Custom plugin to use crypto polyfills only in client builds, not SSR
// SSR/Cloudflare Workers have native crypto support
const conditionalCryptoPolyfills = (): Plugin => ({
  name: 'conditional-crypto-polyfills',
  enforce: 'pre', // Run before other plugins
  resolveId(source, importer, options) {
    // In SSR context: redirect crypto/stream/buffer to virtual modules that re-export Node.js built-ins
    // In client context: return null to let the config-level aliases handle it
    if (options?.ssr !== false) {
      if (source === 'crypto' || source === 'crypto-browserify') {
        return '\0virtual:crypto-ssr'
      }
      if (source === 'stream' || source === 'stream-browserify') {
        return '\0virtual:stream-ssr'
      }
      if (source === 'buffer') {
        return '\0virtual:buffer-ssr'
      }
    }
    return null
  },
  load(id) {
    // Load virtual modules that re-export Node.js built-ins for SSR
    if (id === '\0virtual:crypto-ssr') {
      return `export * from 'node:crypto'; export { default } from 'node:crypto';`
    }
    if (id === '\0virtual:stream-ssr') {
      return `export * from 'node:stream'; export { default } from 'node:stream';`
    }
    if (id === '\0virtual:buffer-ssr') {
      return `import { Buffer } from 'node:buffer'; export { Buffer }; export default Buffer;`
    }
    return null
  },
})

// https://vitejs.dev/config/
export default defineConfig((env) => ({
  server: {
    port: 3000,
  },
  plugins: [
    conditionalCryptoPolyfills(),
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
    coverage: {
      provider: 'v8',
      reporter: ['lcovonly', 'text', 'html'],
    },
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      // Crypto polyfills for client builds (overridden by plugin for SSR)
      crypto: 'crypto-browserify',
      stream: 'stream-browserify',
      buffer: 'buffer',
    },
  },
  define: {
    global: 'globalThis',
    'process.env': {},
  },
  optimizeDeps: {
    esbuildOptions: {
      define: {
        global: 'globalThis',
      },
    },
    include: ['buffer', 'crypto-browserify', 'stream-browserify'],
  },
  ssr: {
    optimizeDeps: {
      // Don't pre-bundle crypto polyfills for SSR - Cloudflare Workers have native crypto
      exclude: ['crypto-browserify', 'stream-browserify', 'buffer'],
    },
  },
}))
