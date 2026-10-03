import { cloudflareTest } from '@cloudflare/vitest-pool-workers'
import { defineConfig } from 'vitest/config'
import {
  LOCAL_TEST_DATABASE_URL,
  requireLocalTestDatabase,
} from './src/test-utils/real-db-config.js'

const isRealDbEnabled = process.env.RUN_REAL_DB_TESTS === '1'
const realDbUrl = isRealDbEnabled
  ? requireLocalTestDatabase(
      process.env.RUN_REAL_DB_TESTS,
      process.env.REAL_DB_DATABASE_URL ?? LOCAL_TEST_DATABASE_URL,
    )
  : ''

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: './wrangler.jsonc' },
      miniflare: {
        bindings: {
          RUN_REAL_DB_TESTS: isRealDbEnabled ? '1' : '',
          REAL_DB_DATABASE_URL: realDbUrl,
        },
      },
    }),
  ],
  test: {
    testTimeout: isRealDbEnabled ? 30_000 : 5_000,
    globalSetup: isRealDbEnabled ? ['./test-db.setup.ts'] : [],
    deps: {
      optimizer: {
        ssr: {
          enabled: true,
          include: ['@urql/core'],
        },
      },
    },
  },
})
