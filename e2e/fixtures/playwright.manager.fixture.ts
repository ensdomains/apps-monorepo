import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Page } from '@playwright/test'
import { test as base } from '@playwright/test'
import { config as loadEnv } from 'dotenv'
import { authenticateWithPara } from '../helpers/para-auth.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

loadEnv({ path: path.resolve(__dirname, '..', '.env') })

const PARA_EMAIL = process.env.PARA_E2E_EMAIL ?? 'test1@test.getpara.com'
const PARA_PIN = process.env.PARA_E2E_PIN ?? '123456'

/**
 * Playwright-native fixture with an `authenticatedPage` that handles
 * Para wallet login using frameLocator() + native shadow DOM piercing.
 */
export const test = base.extend<{ authenticatedPage: Page }>({
  authenticatedPage: async ({ page }, use) => {
    const baseURL = process.env.MANAGER_APP_URL ?? 'http://localhost:3000'
    await page.goto(baseURL)
    // Brief wait for app initialisation; cap at 5 s so HMR websocket doesn't block
    await Promise.race([
      page.waitForLoadState('networkidle'),
      page.waitForTimeout(5_000),
    ]).catch(() => {})

    await authenticateWithPara(page, {
      email: PARA_EMAIL,
      pin: PARA_PIN,
    })

    await use(page)
  },
})

export { expect } from '@playwright/test'
