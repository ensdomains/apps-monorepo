import { defineConfig } from '@playwright/test'
import { baseConfig } from '../../playwright.config.base.js'
export default defineConfig({
  ...baseConfig,
  testDir: './tests',
  testMatch: /after-migration-dates.spec.ts$/,
  workers: 1,
  timeout: 600000,
})
