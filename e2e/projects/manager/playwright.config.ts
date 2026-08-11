import { defineConfig } from '@playwright/test'
import { baseConfig } from '../../playwright.config.base.js'

export default defineConfig({
  ...baseConfig,
  timeout: 300_000,
  testDir: './tests',
  use: {
    ...baseConfig.use,
    baseURL: process.env.MANAGER_APP_URL ?? 'http://localhost:3000',
  },
  projects: [
    /**
     * The fixtures' own self-tests (`e2e-build-goal.md` §6 B2), manager side.
     * Runs first; `manager-e2e` depends on it, so a broken fixture aborts the
     * run instead of producing confident wrong results underneath it.
     *
     * It is green today *including* the known `makeV1Name` fault, which is
     * recorded as `test.fail()` rather than skipped — see the spec. That is
     * what makes it safe to gate on: it fails on a new fault, and it also fails
     * when the known one is fixed and the annotation needs removing.
     */
    {
      name: 'harness-manager',
      testDir: '../../specs',
      testMatch: /harness-manager\.spec\.ts$/,
    },
    {
      name: 'manager-e2e',
      testMatch: /\.spec\.ts$/,
      // TODO: restore notification coverage once the notification mock is wired into snapshot env
      testIgnore: /temporaryPremium|migration|notification/,
      dependencies: ['harness-manager'],
    },
  ],
})
