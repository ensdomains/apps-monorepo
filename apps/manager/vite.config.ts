import { fileURLToPath } from 'node:url'
import { cloudflare } from '@cloudflare/vite-plugin'
import { lingui, linguiTransformerBabelPreset } from '@lingui/vite-plugin'
import babel from '@rolldown/plugin-babel'
import tailwindcss from '@tailwindcss/vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'
import {
  assertDeploymentEnvironment,
  assertNetworkConfig,
} from '../../packages/config/src/index.ts'
import { sourceMapsPlugin } from '../../packages/utils/src/posthog/sourceMapsPlugin.ts'
import { MANAGER_ENDPOINTS } from './src/endpoints.ts'

// https://vitejs.dev/config/
export default defineConfig(({ mode, command }) => {
  const env = loadEnv(mode, process.cwd(), '')
  assertDeploymentEnvironment(env, mode)
  // Validate here so direct Vite commands and --mode use the same env files.
  assertNetworkConfig(env, { endpoints: MANAGER_ENDPOINTS })
  if (
    command === 'build' &&
    env.VITE_PUBLIC_POSTHOG_KEY &&
    !env.POSTHOG_API_KEY
  )
    console.warn(
      '[posthog] Source maps are not uploaded: POSTHOG_API_KEY is not configured for this build.',
    )
  return {
    server: {
      port: 3000,
      proxy: {
        '/api': {
          target: process.env.E2E_BACKEND_URL ?? 'http://localhost:2999',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api/, ''),
        },
        // Local E2E: proxy RPC to Anvil fork.
        '/rpc': {
          target: process.env.ANVIL_RPC_URL ?? 'http://127.0.0.1:8545',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/rpc/, ''),
        },
        // Local E2E: proxy bundler + paymaster to avoid CORS.
        '/bundler': {
          target: process.env.E2E_BUNDLER_URL ?? 'http://127.0.0.1:4337',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/bundler/, ''),
        },
        '/paymaster': {
          target: process.env.E2E_PAYMASTER_URL ?? 'http://127.0.0.1:3002',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/paymaster/, ''),
        },
        '/orchestrator': {
          target: process.env.E2E_ORCHESTRATOR_URL ?? 'http://127.0.0.1:3007',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/orchestrator/, ''),
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
      ...(command === 'build' &&
      env.POSTHOG_API_KEY &&
      env.POSTHOG_PROJECT_ID &&
      env.VITE_PUBLIC_POSTHOG_KEY
        ? [
            sourceMapsPlugin({
              personalApiKey: env.POSTHOG_API_KEY,
              projectId: env.POSTHOG_PROJECT_ID,
              host: env.POSTHOG_HOST,
              cliBinaryPath: env.POSTHOG_CLI_BINARY_PATH,
              sourcemaps: {
                releaseName: 'ens-manager',
                releaseVersion: process.env.GITHUB_SHA,
                releaseMode: 'symbol-set',
                deleteAfterUpload: true,
              },
            }),
          ]
        : []),
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
  }
})
