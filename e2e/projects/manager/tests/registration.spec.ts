// e2e/projects/manager/tests/registration.spec.ts
import { test, expect } from '../../../fixtures/playwright.manager.fixture.js'
import {
  authorizeHeadlessConnection,
  dismissBackendAuthModal,
} from '../../../helpers/manager-auth.js'

const MANAGER_APP_URL = process.env.MANAGER_APP_URL ?? 'http://localhost:3000'
const DOMAIN_TO_REGISTER = `e2e-${Date.now().toString(36)}.eth`
const DISCONNECTED_DOMAIN = `e2e-${(Date.now() + 1).toString(36)}.eth`
const LATE_AUTH_DOMAIN = `e2e-${(Date.now() + 2).toString(36)}.eth`

test.describe('ENS name registration', () => {

  test('user is unable to register a name when disconnected', async ({ page }) => {
    await page.goto(MANAGER_APP_URL)

    const searchInput = page.getByPlaceholder('.eth')
    await searchInput.waitFor({ state: 'visible', timeout: 15_000 })
    await searchInput.click()
    await searchInput.fill(DISCONNECTED_DOMAIN.replace(/\.eth$/i, ''))
    await page.getByText('Available').first().waitFor({ state: 'visible', timeout: 15_000 })
    await page.getByText(DISCONNECTED_DOMAIN).click()

    await page.waitForURL(/\/register\//, { timeout: 15_000 })
    await expect(
      page.getByRole('button', { name: /connect or sign in to register/i }),
    ).toBeVisible({ timeout: 15_000 })
  })

  test('registers a name after connecting from the pricing page', async ({ page, wallet }) => {
    await page.goto(MANAGER_APP_URL)

    const searchInput = page.getByPlaceholder('.eth')
    await searchInput.waitFor({ state: 'visible', timeout: 15_000 })
    await searchInput.click()
    await searchInput.fill(LATE_AUTH_DOMAIN.replace(/\.eth$/i, ''))
    await page.getByText('Available').first().waitFor({ state: 'visible', timeout: 15_000 })
    await page.getByText(LATE_AUTH_DOMAIN).click()

    await page.waitForURL(/\/register\//, { timeout: 15_000 })
    await page.getByRole('button', { name: /connect or sign in to register/i }).click()

    // ===== Wallet connect flow (RainbowKit headless web3 provider) =====
    // The connect button above opens the RainbowKit modal; pick the headless
    // provider and authorize the connection.
    await authorizeHeadlessConnection(page, wallet)

    // After connecting, the Rhinestone smart account initialises
    // asynchronously (on a fresh fork this includes SCA deploy + HCA
    // registration + session enable). Two modals can appear in
    // sequence:
    //   1. EnableSessionModal — must be clicked through.
    //   2. BackendAuthModal — should be dismissed (SIWE / notifications
    //      backend, out of scope for the registration test).
    const enableBtn = page.getByRole('button', { name: /enable sessions/i })
    try {
      await enableBtn.waitFor({ state: 'visible', timeout: 30_000 })
      await enableBtn.click()
      const overlay = page.locator('[data-slot="alert-dialog-overlay"]')
      await overlay
        .waitFor({ state: 'hidden', timeout: 30_000 })
        .catch(() => {})
    } catch {
      // Sessions already enabled or feature flag off.
    }
    await dismissBackendAuthModal(page)

    // ===== registration flow =====
    const payButton = page.getByRole('button', { name: /pay with stablecoins/i })
    await payButton.waitFor({ state: 'visible', timeout: 15_000 })
    await payButton.click()
    await page.getByText('USDC', { exact: true }).click()
    await page.getByRole('button', { name: /buy name/i }).click()

    const successBanner = page.locator('p.text-ens-peridot-text-dark')
    await expect(successBanner).toContainText('Registration Complete', {
      timeout: 90_000,
    })

    // if (mockIndexer.enabled) {
    //   mockIndexer.addName({ name: LATE_AUTH_DOMAIN, owner: PARA_EOA_ADDRESS })
    // }

    // await page.goto(
    //   mockIndexer.enabled ? MANAGER_APP_URL : `${MANAGER_APP_URL}/dashboard`,
    // )
    // await page.waitForLoadState('networkidle')

    // const dashboardSearchInput = await findSearchInput(page)
    // await dashboardSearchInput.click()
    // await dashboardSearchInput.fill(LATE_AUTH_DOMAIN.replace(/\.eth$/i, ''))
    // await page.getByText(LATE_AUTH_DOMAIN).first().click()

    // await page.waitForURL(
    //   new RegExp(`/${LATE_AUTH_DOMAIN.replace(/\./g, '\\.')}`),
    //   { timeout: 15_000 },
    // )
    // await expect(page.getByText(LATE_AUTH_DOMAIN).first()).toBeVisible({
    //   timeout: 15_000,
    // })
  })
})
