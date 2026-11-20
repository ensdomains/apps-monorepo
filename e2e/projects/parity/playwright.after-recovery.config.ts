import { defineConfig } from '@playwright/test'
import { baseConfig } from '../../playwright.config.base.js'
export default defineConfig({
  ...baseConfig,
  testDir: './tests',
  testMatch: /after-migration-recovery.spec.ts$/,
  workers: 1,
  timeout: 420000,
  use: { ...baseConfig.use, actionTimeout: 15000 },
})
