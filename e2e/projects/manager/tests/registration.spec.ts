// e2e/projects/manager/tests/registration.spec.ts
// import { test, expect } from '@playwright/test'
import { test, expect } from '../../../fixtures/playwright.manager.fixture.js'
import { createConsoleMonitor } from '../../../helpers/console-monitor.js'
import { fillParaOtpInput, clickParaSignInButton } from '../../../helpers/para-auth.js'

const MANAGER_APP_URL = process.env.MANAGER_APP_URL ?? 'http://localhost:3000'
const PARA_EMAIL = process.env.PARA_E2E_EMAIL ?? 'test1@test.getpara.com'
const PARA_PIN = process.env.PARA_E2E_PIN ?? '123456'
const DOMAIN_TO_REGISTER =
  process.env.E2E_DOMAIN ?? `e2e-${Date.now().toString(36)}.eth`
const DISCONNECTED_DOMAIN = `e2e-${(Date.now() + 1).toString(36)}.eth`
const LATE_AUTH_DOMAIN = `e2e-${(Date.now() + 2).toString(36)}.eth`

test.describe('ENS name registration', () => {
  test('registers a name via Para wallet and stablecoin payment', async ({
    authenticatedPage: page,
  }) => {
    // ===== registration flow =====
    const nameOnly = DOMAIN_TO_REGISTER.replace(/\.eth$/i, '')
    const searchInput = page.getByPlaceholder("Search name, address...").first()
    await searchInput.waitFor({ state: 'visible', timeout: 15_000 })
    await searchInput.click()
    await searchInput.fill(nameOnly)
    await page.getByText(DOMAIN_TO_REGISTER).click()

    // const incrementButton =
    //   page.locator('button[aria-label="Increment"]').or(
    //     page.locator('button:has(svg.lucide-plus)'),
    //   )
    // await incrementButton.waitFor({ state: 'visible', timeout: 10_000 })
    // await incrementButton.click()

    await page
      .getByRole('button', { name: /pay with stablecoins/i })
      .click()
    await page.getByText('USDC', { exact: true }).click()
    await page
      .getByRole('button', { name: /confirm payment/i })
      .click()

    const monitor = createConsoleMonitor(page, {
      onStateChange: (state, allStates) => {
        console.log(
          `[Registration] ${state} (seen: ${allStates.join(' → ')})`,
        )
      },
    })

    await page
      .getByRole('button', { name: /buy name/i })
      .click()

    // await monitor.waitForRegistrationComplete(120_000)
    // expect(monitor.getLastState()).toBe('success')

    const successBanner = page.locator('p.text-ens-peridot-text-dark')
    await expect(successBanner).toContainText('Registration Complete', {
      timeout: 30_000,
    })
  })

  test('user is unable to register a name when disconnected', async ({ page }) => {
    await page.goto(MANAGER_APP_URL)

    const searchInput = page.getByPlaceholder('.eth')
    await searchInput.waitFor({ state: 'visible', timeout: 15_000 })
    await searchInput.click()
    await searchInput.fill(DISCONNECTED_DOMAIN.replace(/\.eth$/i, ''))
    await page.getByText(DISCONNECTED_DOMAIN).click()

    await page.waitForURL(/\/register\//, { timeout: 15_000 })
    await expect(
      page.getByRole('button', { name: /connect or sign in to register/i }),
    ).toBeVisible({ timeout: 15_000 })
  })

  test('registers a name after connecting from the pricing page', async ({ page }) => {
    await page.goto(MANAGER_APP_URL)

    const searchInput = page.getByPlaceholder('.eth')
    await searchInput.waitFor({ state: 'visible', timeout: 15_000 })
    await searchInput.click()
    await searchInput.fill(LATE_AUTH_DOMAIN.replace(/\.eth$/i, ''))
    await page.getByText(LATE_AUTH_DOMAIN).click()

    await page.waitForURL(/\/register\//, { timeout: 15_000 })
    await page.getByRole('button', { name: /connect or sign in to register/i }).click()

    // ===== Para auth flow =====
    const emailInput = page.locator('input[id="cpsl-input-0"]')
    await emailInput.waitFor({ state: 'visible', timeout: 15_000 })
    await emailInput.fill(PARA_EMAIL)
    await page.locator('cpsl-button[slot="end"]').last().click()

    await fillParaOtpInput(page, PARA_PIN)
    await clickParaSignInButton(page)

    // ===== registration flow =====
    const payButton = page.getByRole('button', { name: /pay with stablecoins/i })
    await payButton.waitFor({ state: 'visible', timeout: 15_000 })
    await payButton.click()
    await page.getByText('USDC', { exact: true }).click()
    await page.getByRole('button', { name: /confirm payment/i }).click()
    await page.getByRole('button', { name: /buy name/i }).click()

    const successBanner = page.locator('p.text-ens-peridot-text-dark')
    await expect(successBanner).toContainText('Registration Complete', {
      timeout: 50_000,
    })
  })
})