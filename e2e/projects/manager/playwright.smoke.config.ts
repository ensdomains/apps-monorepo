import { defineConfig } from '@playwright/test'
import { baseConfig } from '../../playwright.config.base.js'

/**
 * The curated smoke subset of the manager suite — see
 * `e2e/docs/smoke-suite.md`. Manager's presence in the smoke gate is
 * deliberately thin: the wider manager project has a known, separately
 * tracked connect-flow instability (`e2e/coverage/handoff.md`, iteration 4),
 * and `profile.spec.ts` mixes 19 reliable passes with 3 real, unrelated
 * failures in a single 25-minute file — not something a fast trust-worthy
 * gate can afford. `registration.spec.ts`'s happy path is the one manager
 * area verified fast (~70s) and fully reliable in a fresh same-day run, so
 * it is the only manager slice in scope here.
 *
 * Same shape as `playwright.config.ts`: `harness-manager` gates the suite,
 * thinned by `grep` to just the two `makeV2Name` fixture checks the
 * registration path actually touches.
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
      dependencies: ['harness-manager'],
    },
  ],
})
