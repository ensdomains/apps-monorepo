import {
  test,
  expect,
  connectWithHeadlessWallet,
} from '../../../fixtures/playwright.portal.fixture.js'
import {
  authorizeTransaction,
} from '../../../helpers/portal-auth.js'
import { createConsoleMonitor } from '../../../helpers/console-monitor.js'

const PORTAL_APP_URL = process.env.PORTAL_APP_URL ?? 'http://localhost:3001'
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
    await page.goto(
      `${PORTAL_APP_URL}/register?name=${DOMAIN_TO_REGISTER}`,
    )

    // Wait for the registration form to load with the name visible
    await expect(page.getByText(DOMAIN_TO_REGISTER).first()).toBeVisible({
      timeout: 30_000,
    })

    // ── 3. Select USDC in the payment modal ────────────────────────
    const paymentDialog = page
      .getByRole('dialog')
      .filter({ hasText: 'Select payment method' })

    await expect(paymentDialog).toBeVisible({ timeout: 10_000 })

    const usdcOption = paymentDialog.getByRole('button', { name: 'USDC' }).first()
    await usdcOption.waitFor({ state: 'visible', timeout: 10_000 })
    await usdcOption.click()

    const registerButton = paymentDialog.getByRole('button', {
      name: /^Register$/i,
    })
    await registerButton.waitFor({ state: 'visible', timeout: 10_000 })
    await registerButton.click()

    // ── 5. Review transaction steps and start registration ───────
    const transactionDialog = page
      .getByRole('dialog')
      .filter({ hasText: 'Transaction flow' })

    await expect(transactionDialog).toBeVisible({ timeout: 30_000 })

    await Promise.all(
      ['Deploy resolver', 'Submit commitment', 'Approve payment', 'Register name'].map(
        async (stepTitle) => {
          await expect(transactionDialog.getByText(stepTitle)).toBeVisible({
            timeout: 30_000,
          })
        },
      ),
    )

    const monitor = createConsoleMonitor(page, {
      onStateChange: (state, allStates) => {
        console.log(
          `[Portal Registration] ${state} (seen: ${allStates.join(' → ')})`,
        )
      },
    })

    const startButton = transactionDialog.getByRole('button', {
      name: /^Start$/i,
    })
    await startButton.waitFor({ state: 'visible', timeout: 10_000 })
    await startButton.click()

    const transactionSteps = [
      'Deploy resolver',
      'Submit commitment',
      'Approve payment',
      'Register name',
    ]

    for (const stepTitle of transactionSteps) {
      await expect(transactionDialog.getByText(stepTitle)).toBeVisible({
        timeout: 30_000,
      })

      const openWalletButton = transactionDialog.getByRole('button', {
        name: /open wallet/i,
      })
      await openWalletButton.waitFor({ state: 'visible', timeout: 30_000 })
      await openWalletButton.click()

      await authorizeTransaction(wallet, 60_000)

      const nextButton = transactionDialog.getByRole('button', {
        name: /^(Next|Done)$/i,
      })
      await nextButton.waitFor({ state: 'visible', timeout: 120_000 })
      await nextButton.click()

      if (stepTitle !== 'Register name') {
        const nextStartButton = transactionDialog.getByRole('button', {
          name: /^Start$/i,
        })
        await nextStartButton.waitFor({ state: 'visible', timeout: 30_000 })
        await nextStartButton.click()
      }
    }

    // Wait for registration to complete or error out
    await monitor.waitForRegistrationComplete(240_000)

    // ── 7. Assert success ──────────────────────────────────────────
    expect(monitor.getLastState()).toBe('success')

    // Also check the UI
    const successAlert = page.getByText('Registration complete!')
    await expect(successAlert).toBeVisible({ timeout: 30_000 })
  })
})
