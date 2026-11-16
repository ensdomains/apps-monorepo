import { defineConfig } from '@playwright/test'
import { baseConfig } from '../../playwright.config.base.js'

/**
 * API-only project: no `page`/browser fixture is ever referenced by these
 * specs, so Playwright never launches a browser for this project — it's
 * used purely as this suite's existing HTTP-request test runner
 * (`request` fixture) against the locally-run metadata service
 * (`pnpm e2e:infra:up`, service `metadata-service` — see
 * `../../infra/docker-compose.yml`).
 */
export default defineConfig({
  ...baseConfig,
  testDir: './tests',
  // Chain writes (name registration, migration) share the same Anvil fork as
  // every other project; each spec wraps its body in `withChainSnapshot` for
  // isolation. `baseConfig` already pins `workers: 1`.
  projects: [
    {
      name: 'metadata-e2e',
      testMatch: /\.spec\.ts$/,
    },
  ],
})
