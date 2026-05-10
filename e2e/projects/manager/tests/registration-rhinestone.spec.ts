/**
 * Rhinestone registration E2E test.
 *
 * Exercises the same UI journey as registration.spec.ts but under the
 * Rhinestone provider path (smart-account machine routes to
 * initializeRhinestoneAccount → mockestrator orchestrator).
 *
 * Prerequisites:
 *   - E2E infra running: `pnpm e2e:infra:up` (Anvil + Alto + Paymaster + Mockestrator)
 *   - Manager app started with Rhinestone env vars:
 *       VITE_FF_RHINESTONE_SESSIONS=true
 *       VITE_RHINESTONE_ENDPOINT_URL=/orchestrator
 *       VITE_RHINESTONE_CUSTOM_RPC_URLS='{"11155111":"http://127.0.0.1:8545"}'
 */
import { test, expect } from '../../../fixtures/playwright.manager.fixture.js'
import { createConsoleMonitor } from '../../../helpers/console-monitor.js'
import { findSearchInput } from '../../../helpers/search-input.js'

const DOMAIN_TO_REGISTER = `rh-e2e-${Date.now().toString(36)}.eth`

test.describe('ENS name registration (Rhinestone)', () => {
  test('registers a name via Para wallet using Rhinestone orchestrator', async ({
    authenticatedPage: page,
  }) => {
    const nameOnly = DOMAIN_TO_REGISTER.replace(/\.eth$/i, '')
    const searchInput = await findSearchInput(page)
    await searchInput.click()
    await searchInput.fill(nameOnly)
    await page.getByText(DOMAIN_TO_REGISTER).click()

    await page
      .getByRole('button', { name: /pay with stablecoins/i })
      .click()
    await page.getByText('USDC', { exact: true }).click()

    const monitor = createConsoleMonitor(page, {
      onStateChange: (state, allStates) => {
        console.log(
          `[Rhinestone Registration] ${state} (seen: ${allStates.join(' → ')})`,
        )
      },
    })

    await page.getByRole('button', { name: /buy name/i }).click()

    const successBanner = page.locator('p.text-ens-peridot-text-dark')
    await expect(successBanner).toContainText('Registration Complete', {
      timeout: 120_000,
    })
  })
})
