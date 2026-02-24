import { defineConfig } from '@playwright/test'

/**
 * E2E tests for the manager app using Playwright as test runner and Stagehand for browser automation.
 * Stagehand runs the browser locally (env: LOCAL); Playwright does not launch its own browser.
 */
export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? 'github' : 'list',
  timeout: 120_000,
  expect: {
    timeout: 15_000,
  },
  use: {
    baseURL: process.env.MANAGER_APP_URL ?? 'http://localhost:3000',
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'manager-e2e',
      testMatch: /\.spec\.ts$/,
    },
  ],
})
