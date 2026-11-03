import { defineConfig } from '@playwright/test'
import { baseConfig } from '../../playwright.config.base.js'

export default defineConfig({
  ...baseConfig,
  testDir: './tests',
  projects: [
    {
      name: 'cross-app-e2e',
      testMatch: /\.spec\.ts$/,
      testIgnore: /-time\.spec\.ts$/,
    },
    {
      // Moves the shared fork clock forward for good, so it runs after every
      // other cross-app test and nothing depends on it.
      name: 'cross-app-time',
      testMatch: /-time\.spec\.ts$/,
      dependencies: ['cross-app-e2e'],
    },
  ],
})
