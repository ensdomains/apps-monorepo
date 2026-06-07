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
import { privateKeyToAccount } from 'viem/accounts'
import { test, expect } from '../../../fixtures/playwright.manager.fixture.js'
import { createConsoleMonitor } from '../../../helpers/console-monitor.js'
import { findSearchInput } from '../../../helpers/search-input.js'

const MANAGER_APP_URL = process.env.MANAGER_APP_URL ?? 'http://localhost:3000'
const DOMAIN_TO_REGISTER = `rh-e2e-${Date.now().toString(36)}.eth`
const PARA_EOA_ADDRESS = privateKeyToAccount(
  (process.env.ANVIL_PARA_PRIVATE_KEY ??
    '0x4d1cf5e322e2a7dbfc9e3eccde100ed93167879de7449d18872911ed3a957a81') as `0x${string}`,
).address

test.describe('ENS name registration (Rhinestone)', () => {
  test('registers a name via Para wallet using Rhinestone orchestrator', async ({
    authenticatedPage: page,
    mockIndexer,
  }) => {
    const nameOnly = DOMAIN_TO_REGISTER.replace(/\.eth$/i, '')
    const searchInput = await findSearchInput(page)
    await searchInput.click()
    await searchInput.fill(nameOnly)
    // Wait for the on-chain availability check to resolve so the suggestion
    // links to /register/$name instead of the profile route.
    await page.getByText('Available').first().waitFor({ state: 'visible', timeout: 15_000 })
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
      timeout: 180_000,
    })

    // Feed the name into the mock indexer so dashboard/profile queries return it in CI.
    // if (mockIndexer.enabled) {
    //   mockIndexer.addName({ name: DOMAIN_TO_REGISTER, owner: PARA_EOA_ADDRESS })
    // }

    // await page.goto(
    //   mockIndexer.enabled
    //     ? MANAGER_APP_URL
    //     : `${MANAGER_APP_URL}/dashboard`,
    // )
    // await page.waitForLoadState('networkidle')

    // const dashboardOrHomepageSearchInput = await findSearchInput(page)
    // await dashboardOrHomepageSearchInput.click()
    // await dashboardOrHomepageSearchInput.fill(nameOnly)
    // await page.getByText(DOMAIN_TO_REGISTER).first().click()

    // await page.waitForURL(
    //   new RegExp(`/${DOMAIN_TO_REGISTER.replace(/\./g, '\\.')}`),
    //   { timeout: 15_000 },
    // )
    // await expect(page.getByText(DOMAIN_TO_REGISTER).first()).toBeVisible({
    //   timeout: 15_000,
    // })
  })
})
