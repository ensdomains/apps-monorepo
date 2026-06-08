// e2e/projects/manager/tests/registration.spec.ts
import { test, expect } from '../../../fixtures/playwright.manager.fixture.js'
import {
  authorizeHeadlessConnection,
  authorizeTransaction,
  dismissBackendAuthModal,
} from '../../../helpers/manager-auth.js'
import { findSearchInput } from '../../../helpers/search-input.js'

const MANAGER_APP_URL = process.env.MANAGER_APP_URL ?? 'http://localhost:3000'
const DISCONNECTED_DOMAIN = `e2e-${(Date.now() + 1).toString(36)}.eth`
const LATE_AUTH_DOMAIN = `e2e-${(Date.now() + 2).toString(36)}.eth`

test.describe('ENS name registration', () => {
  test('user is unable to register a name when disconnected', async ({
    page,
  }) => {
    await page.goto(MANAGER_APP_URL)

    const searchInput = await findSearchInput(page)
    await searchInput.click()
    await searchInput.fill(DISCONNECTED_DOMAIN.replace(/\.eth$/i, ''))
    await page
      .getByText('Available')
      .first()
      .waitFor({ state: 'visible', timeout: 15_000 })
    await page.getByText(DISCONNECTED_DOMAIN).click()

    await page.waitForURL(/\/register\//, { timeout: 15_000 })
    await expect(
      page.getByRole('button', { name: /connect to register/i }),
    ).toBeVisible({ timeout: 15_000 })
  })

  test('registers a name after connecting from the pricing page', async ({
    page,
    wallet,
  }) => {
    await page.goto(MANAGER_APP_URL)

    const searchInput = await findSearchInput(page)
    await searchInput.click()
    await searchInput.fill(LATE_AUTH_DOMAIN.replace(/\.eth$/i, ''))
    await page
      .getByText('Available')
      .first()
      .waitFor({ state: 'visible', timeout: 15_000 })
    await page.getByText(LATE_AUTH_DOMAIN).click()

    await page.waitForURL(/\/register\//, { timeout: 15_000 })
    await page
      .getByRole('button', { name: /connect to register/i })
      .click()

    // The connect button above opens the RainbowKit modal; pick the headless
    // provider and authorize the connection.
    await authorizeHeadlessConnection(page, wallet)

    // EOA mode (VITE_FF_USE_EOA=true): no smart-account/EnableSessions step —
    // just dismiss the SIWE modal, then register via direct EOA transactions.
    await dismissBackendAuthModal(page)

    await page.getByRole('button', { name: /pay with stablecoins/i }).click()
    await page.getByText('USDC', { exact: true }).click()
    await page.getByRole('button', { name: /buy name/i }).click()

    const successBanner = page.locator('p.text-ens-peridot-text-dark')
    // Authorize the EOA registration transactions (deploy-resolver? → commit →
    // approve USDC → register) while waiting for completion. Break early once
    // no further transaction appears.
    const authorizeAll = (async () => {
      for (let i = 0; i < 4; i++) {
        try {
          await authorizeTransaction(wallet, 120_000)
        } catch {
          break
        }
      }
    })()
    await Promise.all([
      authorizeAll,
      expect(successBanner).toContainText('Registration Complete', {
        timeout: 180_000,
      }),
    ])
  })
})
