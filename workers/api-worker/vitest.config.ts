import { cloudflareTest } from '@cloudflare/vitest-pool-workers'
import { configDefaults, defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: './wrangler.jsonc' },
    }),
  ],
  test: {
    exclude: [...configDefaults.exclude, 'scripts/**'],
    deps: {
      optimizer: {
        ssr: {
          enabled: true,
          include: ['graphql-request'],
        },
      },
    },
  },
})
