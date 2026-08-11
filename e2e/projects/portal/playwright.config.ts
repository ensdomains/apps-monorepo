import { defineConfig } from '@playwright/test'
import { baseConfig } from '../../playwright.config.base.js'

export default defineConfig({
  ...baseConfig,
  testDir: './tests',
  use: {
    ...baseConfig.use,
    baseURL: process.env.PORTAL_APP_URL ?? 'http://localhost:3001',
  },
  projects: [
    /**
     * The fixtures' own self-tests (`e2e-build-goal.md` §6 B2). Runs first and
     * `portal-e2e` depends on it, so a broken fixture aborts the run instead of
     * producing a suite-full of confident wrong results underneath it — which
     * is what happened when `makeV1Name` was writing to a deployment the app
     * never read, for weeks, green the whole time.
     *
     * `testDir` is overridden per-project because the harness spec is shared
     * and lives outside `projects/portal/tests`.
     */
    {
      name: 'harness',
      testDir: '../../specs',
      testMatch: /harness\.spec\.ts$/,
    },
    {
      name: 'portal-e2e',
      testMatch: /.*\.spec\.ts$/, // all tests in the tests directory
      dependencies: ['harness'],
    },
  ],
})
