import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { cloudflare } from '@cloudflare/vite-plugin'
import { lingui, linguiTransformerBabelPreset } from '@lingui/vite-plugin'
import babel from '@rolldown/plugin-babel'
import tailwindcss from '@tailwindcss/vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

const OG_FONT_FILES = [
  'abc-monument-grotesk-medium.ttf',
  'abc-monument-grotesk-mono-regular.ttf',
  'abc-monument-grotesk-semi-mono-regular.ttf',
] as const

/**
 * OG fonts are imported only by a server route, so Vite otherwise emits them
 * beside the server chunks. Emit the same Vite assets in the client output,
 * which is the directory exposed by the Cloudflare ASSETS binding.
 */
function managerOgFontAssets(): Plugin {
  return {
    name: 'manager-og-font-assets',
    applyToEnvironment: (environment) => environment.name === 'client',
    buildStart() {
      for (const file of OG_FONT_FILES) {
        this.emitFile({
          type: 'asset',
          name: file,
          source: readFileSync(
            new URL(`./src/assets/fonts/og/${file}`, import.meta.url),
          ),
        })
      }
    },
  }
}

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
      // Local E2E: proxy RPC to Anvil fork.
      '/rpc': {
        target: 'http://127.0.0.1:8545',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/rpc/, ''),
      },
      // Local E2E: proxy bundler + paymaster to avoid CORS.
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
      '/orchestrator': {
        target: 'http://127.0.0.1:3007',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/orchestrator/, ''),
      },
      '/indexer': {
        target: 'http://127.0.0.1:5655',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/indexer/, ''),
      },
    },
  },
  plugins: [
    cloudflare({
      viteEnvironment: { name: 'ssr' },
    }),
    tanstackStart(),
    viteReact(),
    lingui(),
    babel({
      presets: [linguiTransformerBabelPreset()],
    }),
    tailwindcss(),
    managerOgFontAssets(),
  ],
  optimizeDeps: {
    // Pre-bundle deps that Vite discovers late (during route navigation).
    // Without this, Vite re-optimises mid-session and triggers a full page
    // reload, which can crash React (especially in headless CI browsers).
    include: [
      'buffer',
      '@rhinestone/sdk',
      '@rhinestone/sdk/actions/smart-sessions',
      '@rhinestone/sdk/errors',
    ],
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    rolldownOptions: {
      experimental: {
        lazyBarrel: true, // Reduces compiled modules for barrel exports
      },
    },
  },
})
