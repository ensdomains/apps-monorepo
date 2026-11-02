import { defineConfig } from '@playwright/test'
import { baseConfig } from '../../playwright.config.base.js'

/**
 * The curated smoke subset of the portal suite — see `e2e/docs/smoke-suite.md`
 * for the full rationale. Same two-project shape as `playwright.config.ts`
 * (harness gates the real suite), but scoped down with `grep` to just the
 * tests tagged `@smoke`.
 *
 * `grep` is applied globally by Playwright, so it also thins the `harness`
 * dependency project down to the handful of fixture checks the smoke tests
 * actually rely on (wallet connect + funding, chain-fork reachability) —
 * not all 15 harness tests. That is deliberate: the smoke gate should be
 * fast, not exhaustively re-prove every fixture the nightly run already
 * covers.
 *
 * Every tagged test keeps its original `@scenario:`/`@inv:` tag too, so
 * `pnpm e2e:coverage` still counts it the same way it always did — `@smoke`
 * is purely an additional selector, not a replacement scenario id.
 */
export default defineConfig({
  ...baseConfig,
  testDir: './tests',
  grep: /@smoke/,
  use: {
    ...baseConfig.use,
    baseURL: process.env.PORTAL_APP_URL ?? 'http://localhost:3001',
  },
  projects: [
    {
      name: 'harness',
      testDir: '../../specs',
      testMatch: /harness\.spec\.ts$/,
    },
    {
      name: 'portal-smoke',
      testMatch: /.*\.spec\.ts$/,
      dependencies: ['harness'],
    },
  ],
})
