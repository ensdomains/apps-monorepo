import { fileURLToPath } from 'node:url'
import { defineConfig } from '@playwright/test'
import { baseConfig } from '../../playwright.config.base.js'

const results =
  process.env.REPLACEMENT_RESULTS ??
  fileURLToPath(new URL('../../test-results/replacement/', import.meta.url))

// These cases need live discovery; stale-inventory cases must retain the mock.
const excluded = /\bDNS\b|\bstateful\b|\bL00[2-9]\b|\bL01[0-9]\b/i
const indexedMigration = /@scenario:(GW4|GS21|B6|B8|B9)(?:\s|$)/
const directWalletMigration = /bulk renew with the second renewal refused:/

export default defineConfig({
  ...baseConfig,
  workers: 1,
  retries: 0,
  timeout: 420_000,
  forbidOnly: true,
  // These are the excluded legacy categories, not the isolated fixtures that
  // write local-chain state while testing a migration.
  grepInvert: excluded,
  reporter: [
    ['list'],
    ['./strict-reporter.ts'],
    [
      'json',
      {
        outputFile: `${results}/playwright.json`,
      },
    ],
  ],
  outputDir: `${results}/artifacts`,
  use: { ...baseConfig.use, timezoneId: 'UTC', locale: 'en-US' },
  projects: [
    {
      name: 'legacy',
      use: { baseURL: process.env.PORTAL_APP_URL ?? 'http://localhost:3001' },
      testDir: '../parity/tests',
      testIgnore: /after-migration-.*\.spec\.ts$/,
    },
    {
      name: 'after-migration',
      testDir: '../parity/tests',
      testMatch: /after-migration-.*\.spec\.ts$/,
    },
    {
      name: 'records',
      testDir: '../manager/tests',
      testMatch: /record-preservation-(audit|extra|grace)\.spec\.ts$/,
      use: { baseURL: process.env.MANAGER_APP_URL ?? 'http://localhost:3000' },
    },
    {
      name: 'migration',
      grepInvert: [excluded, indexedMigration],
      testDir: '../manager/tests',
      testMatch: /migration(-[a-z]+)?\.spec\.ts$/,
      use: { baseURL: process.env.MANAGER_APP_URL ?? 'http://localhost:3000' },
    },
    {
      name: 'migration-indexed',
      testDir: '../manager/tests',
      testMatch: /migration(-[a-z]+)?\.spec\.ts$/,
      grep: indexedMigration,
      grepInvert: [excluded, directWalletMigration],
      use: { baseURL: process.env.MANAGER_APP_URL ?? 'http://localhost:3000' },
    },
    {
      name: 'migration-indexed-eoa',
      testDir: '../manager/tests',
      testMatch: /migration(-[a-z]+)?\.spec\.ts$/,
      grep: directWalletMigration,
      use: { baseURL: process.env.MANAGER_APP_URL ?? 'http://localhost:3000' },
    },
    {
      name: 'cross-app-migration',
      testDir: '../cross-app/tests',
      testMatch: /migration.*\.spec\.ts$/,
    },
  ],
})
