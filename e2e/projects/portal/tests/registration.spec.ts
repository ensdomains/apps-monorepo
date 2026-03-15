import {
  test,
  expect,
  connectWithHeadlessWallet,
} from '../../../fixtures/playwright.portal.fixture.js'
import {
  authorizeTransaction,
} from '../../../helpers/portal-auth.js'
import { createConsoleMonitor } from '../../../helpers/console-monitor.js'

const PORTAL_APP_URL = process.env.PORTAL_APP_URL ?? 'http://localhost:3000'
const DOMAIN_TO_REGISTER =
  process.env.E2E_DOMAIN ?? `e2e-portal-${Date.now().toString(36)}.eth`

test.describe('Portal ENS name registration', () => {
  test('registers a name via headless wallet and stablecoin payment', async ({
    portalPage: page,
    wallet,
  }) => {
    test.setTimeout(300_000) // Registration involves multiple on-chain txs

    // ── 1. Connect wallet ──────────────────────────────────────────
    await connectWithHeadlessWallet(page, wallet)

    // ── 2. Navigate to registration page ───────────────────────────
    const nameOnly = DOMAIN_TO_REGISTER.replace(/\.eth$/i, '')
    await page.goto(
      `${PORTAL_APP_URL}/register?name=${DOMAIN_TO_REGISTER}`,
    )

    // Wait for the registration form to load with the name visible
    await expect(page.getByText(DOMAIN_TO_REGISTER).first()).toBeVisible({
      timeout: 30_000,
    })

    // ── 3. Click Continue to open payment token modal ──────────────
    const continueButton = page.getByRole('button', { name: 'Continue' })
    await continueButton.waitFor({ state: 'visible', timeout: 30_000 })
    await continueButton.click()

    // ── 4. Select USDC in the payment modal ────────────────────────
    // Wait for the "Select payment token" dialog to appear
    await expect(
      page.getByText('Select payment token'),
    ).toBeVisible({ timeout: 10_000 })

    // Click the USDC token option
    const usdcOption = page.locator('button').filter({ hasText: 'USDC' }).first()
    await usdcOption.waitFor({ state: 'visible', timeout: 10_000 })
    await usdcOption.click()

    // Click "Continue with USDC"
    const continueWithUsdc = page.getByRole('button', {
      name: /continue with usdc/i,
    })
    await continueWithUsdc.waitFor({ state: 'visible', timeout: 10_000 })
    await continueWithUsdc.click()

    // ── 5. Confirm purchase ────────────────────────────────────────
    await expect(
      page.getByText('Confirm purchase'),
    ).toBeVisible({ timeout: 10_000 })

    // Start console monitor before triggering transactions
    const monitor = createConsoleMonitor(page, {
      onStateChange: (state, allStates) => {
        console.log(
          `[Portal Registration] ${state} (seen: ${allStates.join(' → ')})`,
        )
      },
    })

    // Click "Buy name"
    const buyButton = page.getByRole('button', { name: /buy name/i })
    await buyButton.waitFor({ state: 'visible', timeout: 10_000 })
    await buyButton.click()

    // ── 6. Authorize transactions ──────────────────────────────────
    // The registration flow involves multiple transactions:
    // - Deploy resolver proxy
    // - Commit transaction
    // - Token approval
    // - Register transaction
    //
    // `wallet.authorize(SendTransaction)` from the headless provider
    // will wait for the next pending request if one doesn't exist yet,
    // so we can pre-call authorize and it will auto-approve each tx
    // as soon as it arrives.
    //
    // We run a continuous authorization loop concurrently with state monitoring.
    let registrationDone = false

    const authLoop = (async () => {
      while (!registrationDone) {
        try {
          // Short timeout per iteration so we can check `registrationDone` promptly
          await authorizeTransaction(wallet, 10_000)
          console.log('[Portal E2E] Authorized a SendTransaction')
        } catch {
          // Timeout — no tx pending, loop again
        }
      }
    })()

    // Wait for registration to complete or error out
    try {
      await monitor.waitForRegistrationComplete(240_000)
    } finally {
      registrationDone = true
    }

    // Drain the auth loop
    await authLoop.catch(() => {})

    // ── 7. Assert success ──────────────────────────────────────────
    expect(monitor.getLastState()).toBe('success')

    // Also check the UI
    const successAlert = page.getByText('Registration complete!')
    await expect(successAlert).toBeVisible({ timeout: 30_000 })
  })
})
