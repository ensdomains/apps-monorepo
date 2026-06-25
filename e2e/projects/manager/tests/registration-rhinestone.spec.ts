/**
 * Rhinestone HCA registration E2E test.
 *
 * With VITE_FF_USE_EOA=false (default) the registration machine routes
 * transactions through the Rhinestone Warp orchestrator. The flow is:
 *   1. deploy-resolver  (eth_signTypedData_v4 — SingleChainOps intent,
 *                        auto-authorized by PERMITTED_SIGN_KINDS)
 *   2. commit           (eth_signTypedData_v4 — same, auto-authorized)
 *   3. [commitment age wait — handled by the app]
 *   4. approve USDC     (eth_sendTransaction — EOA signs the ERC-20 approval,
 *                        authorized explicitly via authorizeTransaction)
 *   5. register         (eth_signTypedData_v4 — same, auto-authorized)
 *
 * The mockestrator impersonates the HCA on the Anvil fork to fill each intent.
 * It needs ETH in the HCA address to pay for impersonated gas — the fund script
 * (`e2e/infra/scripts/fund-rhinestone-account.sh`) must include the HCA for
 * Anvil account 0 (0xb0663…888b4), which is the E2E headless wallet owner.
 *
 * Prerequisites:
 *   - E2E infra running: `pnpm e2e:infra:up` (Anvil + Alto + Paymaster + Mockestrator)
 *   - Manager app with VITE_FF_USE_EOA=false and VITE_FF_USE_WARP_INFRA=true
 */
import { test, expect } from '../../../fixtures/playwright.manager.fixture.js'
import { createConsoleMonitor } from '../../../helpers/console-monitor.js'
import { clickThroughEnableSessions } from '../../../helpers/manager-auth.js'
import { findSearchInput } from '../../../helpers/search-input.js'

const DOMAIN_TO_REGISTER = `rh-e2e-${Date.now().toString(36)}.eth`

test.describe('ENS name registration (Rhinestone HCA)', () => {
  test('registers a name via Rhinestone HCA headless wallet', async ({
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
    // Smart-session gate: on the HCA path (VITE_FF_USE_EOA=false) clicking
    // "Pay with stablecoins" opens the EnableSessions modal BEFORE the token
    // picker. Click through it (the single ENABLE intent is auto-authorized via
    // PERMITTED_SIGN_KINDS); idempotent no-op in EOA mode.
    await clickThroughEnableSessions(page)
    await page.getByText('USDC', { exact: true }).click()

    createConsoleMonitor(page, {
      onStateChange: (state, allStates) => {
        console.log(`[Registration] ${state} (seen: ${allStates.join(' → ')})`)
      },
    })

    await page.getByRole('button', { name: /buy name/i }).click()

    const successBanner = page.locator('p.text-ens-peridot-text-dark')

    // In the Rhinestone HCA flow all intents are eth_signTypedData_v4 and are
    // auto-authorized by PERMITTED_SIGN_KINDS. The ONE exception is the USDC
    // ERC-20 approval: the registrar pulls tokens from the EOA (not the HCA),
    // so the approval must be a direct EOA eth_sendTransaction signed by the
    // connected wallet. Authorize that single approval; ignore timeout (the
    // approval is skipped when the allowance is already sufficient).
    const { authorizeTransaction } = await import('../../../helpers/manager-auth.js')
    const authorizeApproval = authorizeTransaction(wallet, 240_000).catch(() => {})
    await Promise.all([
      authorizeApproval,
      expect(successBanner).toContainText('Registration Complete', { timeout: 240_000 }),
    ])

    if (mockIndexer.enabled) {
      mockIndexer.addName({ name: DOMAIN_TO_REGISTER, owner: accounts.getAddress('user') })
    }
  })
})
