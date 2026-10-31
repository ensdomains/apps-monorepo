import { defineConfig } from '@playwright/test'

// Browser-only harness regressions; no wallet, chain or indexer is required.
export default defineConfig({
  testDir: './tests',
  testMatch: '**/*.harness.spec.ts',
  outputDir: '../../test-results/migration-matrix-harness',
  workers: 1,
  timeout: 30_000,
  reporter: 'list',
  use: { headless: true, trace: 'off' },
})
