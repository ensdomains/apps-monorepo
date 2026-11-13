import { defineConfig } from '@playwright/test'
import { baseConfig } from '../../playwright.config.base.js'
export default defineConfig({
  ...baseConfig,
  testDir: './tests',
  testMatch: /after-migration-actions.spec.ts$/,
  timeout: 420_000,
  use: { ...baseConfig.use, actionTimeout: 15_000 },
  workers: 1,
})
