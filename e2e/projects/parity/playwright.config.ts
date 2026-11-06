import { defineConfig } from '@playwright/test'
import { baseConfig } from '../../playwright.config.base.js'

export default defineConfig({
  ...baseConfig,
  testDir: './tests',
  use: { ...baseConfig.use, baseURL: 'http://localhost:3001' },
  projects: [{ name: 'legacy-parity' }],
})
