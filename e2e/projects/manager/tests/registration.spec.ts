// e2e/projects/manager/tests/registration.spec.ts
// import { test, expect } from '@playwright/test'
import { test, expect } from '../../../fixtures/playwright.fixture.js'
import { createConsoleMonitor } from '../../../helpers/console-monitor.js'

const MANAGER_APP_URL = process.env.MANAGER_APP_URL ?? 'http://localhost:3000'
const PARA_EMAIL = process.env.PARA_E2E_EMAIL ?? 'test1@test.getpara.com'
const PARA_PIN = process.env.PARA_E2E_PIN ?? '123456'
const DOMAIN_TO_REGISTER =
  process.env.E2E_DOMAIN ?? `e2e-${Date.now().toString(36)}.eth`

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
})