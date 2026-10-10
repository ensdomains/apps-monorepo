import { defineConfig } from '@playwright/test'
import { baseConfig } from '../../playwright.config.base.js'

/**
 * The migration suite, run as its own project.
 *
 * `playwright.config.ts`'s `manager-e2e` project excludes every `migration*`
 * spec via `testIgnore`, so nothing in that family runs and the coverage
 * reconciler counts all of it as non-terminal `excluded`. Rather than widen
 * that regex — which silently re-enables the two specs whose stability is
 * still unproven — subname migration gets its own config, on the same
 * two-project shape as `playwright.config.ts`.
 *
 * The `harness-manager` dependency is the point: `makeV1Subname` and
 * `makeV1RegistrySubname` are new, and a fixture that quietly does nothing
 * produces confident wrong results underneath every test in this file. The
 * harness gate fails the run instead.
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
      name: 'harness-manager',
      testDir: '../../specs',
      testMatch: /harness-manager\.spec\.ts$/,
    },
    {
      name: 'manager-migration',
      testMatch:
        /migration(-(subname|grace|fuses|managers|approvals))?\.spec\.ts$/,
      dependencies: ['harness-manager'],
    },
    {
      // Moves the shared fork clock forward for good (91 days), so it runs
      // after everything else here and nothing depends on it.
      name: 'manager-migration-time',
      testMatch: /migration-time\.spec\.ts$/,
      dependencies: ['manager-migration'],
    },
  ],
})
