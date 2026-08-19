import { defineConfig } from '@playwright/test'
import { baseConfig } from '../../playwright.config.base.js'

/**
 * Migration E2E suite.
 *
 * The default manager project excludes `migration*` specs (they need the V1 fork state and
 * are slow), which left them running nowhere. This config runs them explicitly.
 */
export default defineConfig({
  ...baseConfig,
  timeout: 300_000,
  testDir: './tests',
  use: {
    ...baseConfig.use,
    baseURL: process.env.MANAGER_APP_URL ?? 'http://localhost:3000',
  },
  projects: [
    {
      name: 'manager-migration-e2e',
      testMatch: /migration.*\.spec\.ts$/,
      // Premium migration has its own config and fork requirements.
      testIgnore: /migration-premium/,
    },
  ],
})
