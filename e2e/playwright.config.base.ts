import type { PlaywrightTestConfig } from '@playwright/test'

/**
 * Shared Playwright config for all E2E projects.
 * Each project extends this with its own baseURL and testDir.
 */
export const baseConfig: PlaywrightTestConfig = {
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
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
}
