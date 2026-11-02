import { defineConfig } from '@playwright/test'
import { baseConfig } from '../../playwright.config.base.js'

/**
 * The manager's per-PR smoke gate: every `@smoke` test outside the migration
 * family (see `e2e/docs/smoke-suite.md`). Migration specs run their own
 * `@smoke` slice through `playwright.migration.config.ts`, so they are ignored
 * here; nightly runs both configs in full.
 *
 * Same shape as `playwright.config.ts`: `harness-manager` gates the suite,
 * thinned by `grep` to the fork check (so a run cannot pass against another
 * chain) and the two `makeV2Name` fixture checks.
 */
export default defineConfig({
  ...baseConfig,
  timeout: 300_000,
  testDir: './tests',
  grep: /@smoke/,
  use: {
    ...baseConfig.use,
    baseURL: process.env.MANAGER_APP_URL ?? 'http://localhost:3000',
  },
  projects: [
    {
      name: 'harness-manager',
      testDir: '../../specs',
      testMatch: /harness-manager\.spec\.ts$/,
    },
    {
      name: 'manager-smoke',
      testMatch: /\.spec\.ts$/,
      testIgnore: /temporaryPremium|migration|notification/,
      dependencies: ['harness-manager'],
    },
  ],
})
