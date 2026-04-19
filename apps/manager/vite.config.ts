import { fileURLToPath } from 'node:url'
import { cloudflare } from '@cloudflare/vite-plugin'
import { lingui } from '@lingui/vite-plugin'
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
      // Local E2E: proxy bundler + paymaster to avoid CORS.
      // Set VITE_PIMLICO_BUNDLER_URL=/bundler and VITE_PAYMASTER_URL=/paymaster
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
      // Local E2E: proxy Rhinestone orchestrator requests to mockestrator.
      // Set VITE_RHINESTONE_ENDPOINT_URL=/orchestrator to activate.
      '/orchestrator': {
        target: 'http://127.0.0.1:3007',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/orchestrator/, ''),
      },
      // Local E2E: proxy indexer GraphQL requests to Panoptes API.
      // Set VITE_INDEXER_GRAPHQL_URL=/indexer/graphql to activate.
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
    viteReact({
      babel: {
        plugins: ['@lingui/babel-plugin-lingui-macro'],
      },
    }),
    lingui(),
    tailwindcss(),
  ],
  optimizeDeps: {
    // Pre-bundle deps that Vite discovers late (during route navigation).
    // Without this, Vite re-optimises mid-session and triggers a full page
    // reload, which can crash React (especially in headless CI browsers).
    include: ['buffer'],
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})
