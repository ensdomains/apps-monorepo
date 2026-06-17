import { fileURLToPath } from 'node:url'
import { cloudflare } from '@cloudflare/vite-plugin'
import { lingui, linguiTransformerBabelPreset } from '@lingui/vite-plugin'
import babel from '@rolldown/plugin-babel'
import tailwindcss from '@tailwindcss/vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  // Build-time wallet vendor selection — mirrors USE_PRIVY in
  // src/utils/feature-flags.ts. The `active-wallet-stack` alias resolves to a
  // single vendor stack so only its code is bundled (RainbowKit by default,
  // Privy when VITE_FF_USE_PRIVY is set).
  const usePrivy = env.VITE_FF_USE_PRIVY === 'true'
  if (usePrivy && !env.VITE_PRIVY_APP_ID) {
    throw new Error(
      'VITE_FF_USE_PRIVY=true requires VITE_PRIVY_APP_ID to be set.',
    )
  }
  const activeWalletStack = fileURLToPath(
    new URL(
      usePrivy
        ? './src/lib/wallet/stacks/PrivyStack.tsx'
        : './src/lib/wallet/stacks/RainbowKitStack.tsx',
      import.meta.url,
    ),
  )

  return {
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
        'permissionless',
        'permissionless/accounts',
        'permissionless/clients/pimlico',
        'permissionless/utils',
      ],
    },
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
        // Resolved above from VITE_FF_USE_PRIVY (see WalletProvider.tsx).
        'active-wallet-stack': activeWalletStack,
      },
      // Force a single physical copy of the wagmi/viem stack. RainbowKit pulls a
      // different @wagmi/connectors peer-closure than our wagmiConfig, which
      // would otherwise load two `wagmi` modules — and React context is keyed by
      // module identity, so RainbowKit's useConfig() couldn't see our
      // WagmiProvider (`useConfig must be used within WagmiProvider`).
      dedupe: ['wagmi', '@wagmi/core', '@wagmi/connectors', 'viem'],
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
