import { test, expect } from '@playwright/test'
import { createConsoleMonitor } from '../../../helpers/console-monitor.js'
import {
  authenticateWithPara,
} from '../../../helpers/para-auth.js'

const MANAGER_APP_URL = process.env.MANAGER_APP_URL ?? 'http://localhost:3000'
const PARA_EMAIL = process.env.PARA_E2E_EMAIL ?? 'test1@test.getpara.com'
const PARA_PIN = process.env.PARA_E2E_PIN ?? '123456'
const DOMAIN_TO_REGISTER =
  process.env.E2E_DOMAIN ?? `e2e-${Date.now().toString(36)}.eth`

test.describe('ENS name registration', () => {
  test('registers a name via Para wallet and stablecoin payment', async ({
    page,
  }) => {
    // Navigate to Manager app
    await page.goto(MANAGER_APP_URL)
    await page.waitForLoadState('networkidle').catch(() => {})

    // Authenticate with Para wallet
    await authenticateWithPara(page, { email: PARA_EMAIL, pin: PARA_PIN })

    // Wait for auth to complete and app to be ready
    await page.waitForLoadState('networkidle').catch(() => {})

    // Search for the domain
    const nameOnly = DOMAIN_TO_REGISTER.replace(/\.eth$/i, '')
    const searchInput = page.getByPlaceholder(/search/i)
    await searchInput.waitFor({ state: 'visible', timeout: 15_000 })
    await searchInput.click()
    await searchInput.fill(nameOnly)

    // Click the search result
    await page.getByText(DOMAIN_TO_REGISTER).click()

    // Change registration duration to 2 years ($10 USD)
    // Look for the duration stepper/increment button and click it once (1yr → 2yr)
    const incrementButton = page.locator('button[aria-label="Increment"]').or(
      page.locator('button:has(svg.lucide-plus)'),
    )
    await incrementButton.waitFor({ state: 'visible', timeout: 10_000 })
    await incrementButton.click()

    // Click "Pay with Stablecoins"
    await page
      .getByRole('button', { name: /pay with stablecoins/i })
      .click()

    // Select USDC
    await page.getByText('USDC', { exact: true }).click()

    // Confirm payment
    await page
      .getByRole('button', { name: /confirm payment/i })
      .click()

    // Set up console monitor BEFORE clicking BUY NAME
    const monitor = createConsoleMonitor(page, {
      onStateChange: (state, allStates) => {
        console.log(`[Registration] ${state} (seen: ${allStates.join(' → ')})`)
      },
    })

    // Click "BUY NAME" to complete registration
    await page
      .getByRole('button', { name: /buy name/i })
      .click()

    // Wait for registration to complete
    await monitor.waitForRegistrationComplete(120_000)
    expect(monitor.getLastState()).toBe('success')

    // Verify the success banner appears
    const successBanner = page.locator('p.text-ens-peridot-text-dark')
    await expect(successBanner).toContainText('Registration Complete', {
      timeout: 30_000,
    })
  })
})
