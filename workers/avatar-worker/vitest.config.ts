import { cloudflareTest } from '@cloudflare/vitest-plugin'
import { defineConfig } from 'vitest/config'

// Tests always use local storage and controlled chain responses.
process.env.MAINNET_RPC_URL = 'https://rpc.invalid'
process.env.SEPOLIA_RPC_URL = 'https://rpc.invalid'

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: './wrangler.jsonc' },
      miniflare: {
        bindings: {
          MAINNET_RPC_URL: 'https://rpc.invalid',
          SEPOLIA_RPC_URL: 'https://rpc.invalid',
        },
      },
    }),
  ],
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['lcovonly', 'text'],
      include: ['src/**/*.ts'],
    },
  },
})
