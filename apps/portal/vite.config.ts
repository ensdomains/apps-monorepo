/// <reference types="vitest" />

import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { cloudflare } from '@cloudflare/vite-plugin'
import i18nextLoader from '@ensdomains/vite-plugin-i18next-loader'
import tailwindcss from '@tailwindcss/vite'
import { tanstackRouter } from '@tanstack/router-plugin/vite'
import viteReact from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'
import {
  assertDeploymentEnvironment,
  assertNetworkConfig,
} from '../../packages/config/src/index'
import { PORTAL_ENDPOINTS } from './src/endpoints'

const locales = dirname(
  fileURLToPath(import.meta.resolve('@ensdomains/locales')),
)

// https://vitejs.dev/config/
export default defineConfig(({ mode, command, isPreview }) => {
  const env = loadEnv(mode, process.cwd(), '')
  assertDeploymentEnvironment(env, mode)
  // Validate here so direct Vite commands and --mode use the same env files.
  assertNetworkConfig(env, {
    endpoints: PORTAL_ENDPOINTS,
    allowMissingEndpoints: true,
  })
  return {
    server: {
      port: 3001,
      proxy: {
        // Local E2E: proxy RPC to Anvil fork
        '/rpc': {
          target: 'http://127.0.0.1:8545',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/rpc/, ''),
        },
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
      },
    },
    plugins: [
      tanstackRouter({
        autoCodeSplitting: true,
        routeFileIgnorePattern: '.((css|const).ts)',
      }),
      viteReact(),
      i18nextLoader({ paths: [locales] }),
      tailwindcss(),
      ...(command === 'build' || isPreview ? [cloudflare()] : []),
    ],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
        '@ens-apps/dev-time-travel': fileURLToPath(
          new URL('../../packages/dev-time-travel/src', import.meta.url),
        ),
        '@ens-apps/utils': fileURLToPath(
          new URL('../../packages/utils/src', import.meta.url),
        ),
        '@ens-apps/l2-primary': fileURLToPath(
          new URL('../../packages/l2-primary/src', import.meta.url),
        ),
        '@ens-apps/transaction-manager': fileURLToPath(
          new URL('../../packages/transaction-manager/src', import.meta.url),
        ),
      },
      dedupe: [
        'react',
        'react-dom',
        'react/jsx-runtime',
        'react/jsx-dev-runtime',
        '@tanstack/react-query',
      ],
    },
    optimizeDeps: {
      exclude: ['@ens-apps/l2-primary', '@ens-apps/transaction-manager'],
    },
    build: {
      rolldownOptions: {
        experimental: {
          lazyBarrel: true, // Reduces compiled modules for barrel exports
        },
      },
    },
  }
})
