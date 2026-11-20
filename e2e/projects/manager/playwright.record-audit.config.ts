import { defineConfig } from '@playwright/test'
import { baseConfig } from '../../playwright.config.base.js'
export default defineConfig({
  ...baseConfig,
  testDir: './tests',
  testMatch: /record-preservation-audit.spec.ts$/,
  timeout: 300000,
  use: {
    ...baseConfig.use,
    baseURL: process.env.MANAGER_APP_URL ?? 'http://localhost:3012',
  },
})
