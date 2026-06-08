/**
 * EOA registration E2E test (previously Rhinestone).
 *
 * With VITE_FF_USE_EOA=true the registration machine routes all transactions
 * through the connected wagmi EOA (headless wallet). The flow is:
 *   1. deploy-resolver  (eth_sendTransaction)
 *   2. commit           (eth_sendTransaction)
 *   3. [commitment age wait — handled by the app]
 *   4. approve USDC     (eth_sendTransaction)
 *   5. register         (eth_sendTransaction)
 *
 * Prerequisites:
 *   - E2E infra running: `pnpm e2e:infra:up` (Anvil + Alto + Paymaster)
 *   - Manager app with VITE_FF_USE_EOA=true
 */
import { test, expect } from '../../../fixtures/playwright.manager.fixture.js'
import { createConsoleMonitor } from '../../../helpers/console-monitor.js'
import { findSearchInput } from '../../../helpers/search-input.js'

const DOMAIN_TO_REGISTER = `rh-e2e-${Date.now().toString(36)}.eth`

test.describe('ENS name registration (EOA)', () => {
  test('registers a name via headless EOA wallet', async ({
    connectedPage: page,
    wallet,
    mockIndexer,
    accounts,
  }) => {
    const nameOnly = DOMAIN_TO_REGISTER.replace(/\.eth$/i, '')
    const searchInput = await findSearchInput(page)
    await searchInput.click()
    await searchInput.fill(nameOnly)
    await page.getByText('Available').first().waitFor({ state: 'visible', timeout: 15_000 })
    await page.getByText(DOMAIN_TO_REGISTER).click()

    await page.getByRole('button', { name: /pay with stablecoins/i }).click()
    await page.getByText('USDC', { exact: true }).click()

    createConsoleMonitor(page, {
      onStateChange: (state, allStates) => {
        console.log(`[Registration] ${state} (seen: ${allStates.join(' → ')})`)
      },
    })

    await page.getByRole('button', { name: /buy name/i }).click()

    const successBanner = page.locator('p.text-ens-peridot-text-dark')

    // Authorize up to 4 EOA transactions concurrently with the UI flow:
    // deploy-resolver (may be skipped) → commit → [commitment age wait] → approve USDC → register
    // Each step gets 120s because the commitment age timer sits between commit and approve.
    // We break early if no further transaction appears (e.g. resolver already deployed = 3 txs).
    const { authorizeTransaction } = await import('../../../helpers/manager-auth.js')
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
      expect(successBanner).toContainText('Registration Complete', { timeout: 180_000 }),
    ])

    if (mockIndexer.enabled) {
      mockIndexer.addName({ name: DOMAIN_TO_REGISTER, owner: accounts.getAddress('user') })
    }
  })
})
