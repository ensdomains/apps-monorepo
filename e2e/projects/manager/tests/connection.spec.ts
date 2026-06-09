import { expect, test } from '../../../fixtures/playwright.manager.fixture.js'
import {
  connectWithHeadlessWallet,
  dismissBackendAuthModal,
} from '../../../helpers/manager-auth.js'

const MANAGER_APP_URL = process.env.MANAGER_APP_URL ?? 'http://localhost:3000'

/**
 * Wallet-connection + dashboard-redirect regression coverage.
 *
 * The connect dialog surfaces the e2e headless wallet as an EIP-6963 injected
 * provider ("Headless Web3 Provider"), so these exercise the EXTERNAL-wallet
 * path. The social (Google/X) path goes through Privy's OAuth redirect, which
 * can't be driven headlessly — covering it needs Privy's test/staging mode
 * (tracked separately). The connect → bridge → useConnection plumbing the
 * external path exercises is shared with the social path, so reload/redirect
 * regressions here catch most of what we've been debugging.
 */
test.describe('Wallet connection + dashboard', () => {
  // Match the sibling manager specs (300s): each test registers a name on the
  // fork, connects the wallet, and may wait for smart-account / backend-auth
  // setup — 180s can expire before the reload/redirect assertions on CI.
  test.describe.configure({ timeout: 300_000 })

  test('stays connected on the dashboard across a reload', async ({
    page,
    wallet,
    makeV2Name,
  }) => {
    // A name owned by the connected account → we belong on the dashboard.
    await makeV2Name({ label: 'dashreload' })

    await page.goto(MANAGER_APP_URL)
    await connectWithHeadlessWallet(page, wallet)
    await dismissBackendAuthModal(page)

    const connectButton = page.getByRole('button', {
      name: /^connect( login)?$/i,
    })
    const loading = page.getByText(/loading dashboard/i)

    // The connection cookie satisfies the SSR guard; the dashboard should
    // render (not stick on the loading state) while connected.
    await page.goto(`${MANAGER_APP_URL}/dashboard`)
    await expect(loading).toBeHidden({ timeout: 30_000 })
    await expect(connectButton).toBeHidden()

    // The regression we keep hitting: on reload the connector's in-memory
    // signer is gone, so there's a reconnect gap. It must NOT bounce to '/' or
    // leave the dashboard stuck loading — the bridge re-establishes and we stay.
    await page.reload()

    await expect(page).toHaveURL(/\/dashboard$/, { timeout: 30_000 })
    await expect(connectButton).toBeHidden({ timeout: 30_000 })
    await expect(loading).toBeHidden({ timeout: 30_000 })
  })

  test('redirects to the dashboard after connecting with a registered name', async ({
    page,
    wallet,
    makeV2Name,
  }) => {
    await makeV2Name({ label: 'dashredirect' })

    await page.goto(MANAGER_APP_URL)
    await connectWithHeadlessWallet(page, wallet)
    await dismissBackendAuthModal(page)

    // useRedirectToDashboard should take a connected user who owns a name to the
    // dashboard automatically. If this is flaky, it's surfacing the intermittent
    // redirect we're chasing — that's a signal to fix, not a flaky test to mute.
    await expect(page).toHaveURL(/\/dashboard$/, { timeout: 30_000 })
  })
})
