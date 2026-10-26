import { defineConfig } from '@playwright/test'
import { resolve } from 'node:path'
import { baseConfig } from '../../playwright.config.base.js'

const output = process.env.REPLACEMENT_RESULTS ?? resolve('test-results/migration-matrix')
export default defineConfig({
  ...baseConfig,
  timeout: 360_000,
  retries: 0,
  workers: 1,
  maxFailures: 0,
  testDir: './tests',
  outputDir: resolve(output, 'artifacts'),
  reporter: [
    ['list'],
    ['json', { outputFile: resolve(output, 'playwright-results.json') }],
    ['../replacement/strict-reporter.ts'],
  ],
  use: { ...baseConfig.use, video: 'off', trace: process.env.MATRIX_TRACE === '1' ? 'retain-on-failure' : 'off', baseURL: process.env.MANAGER_APP_URL ?? 'http://localhost:13010' },
  projects: [{ name: 'matrix', testMatch: /\.spec\.ts$/ }],
})
