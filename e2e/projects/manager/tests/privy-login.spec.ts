import { test, expect } from '../../../fixtures/playwright.manager.fixture.js'
import { connectWithPrivyTestAccount } from '../../../helpers/manager-auth.js'

const MANAGER_APP_URL = process.env.MANAGER_APP_URL ?? 'http://localhost:3000'

// Exercises the real Privy login UX (email + deterministic test-account OTP),
// as opposed to the injected-wallet path the other specs use. Verifies the
// app reaches a connected state after a social/email login.
test.describe('Privy login', () => {
  test('logs in with a Privy test account (email + OTP)', async ({ page }) => {
    await page.goto(MANAGER_APP_URL)

    // The nav "Connect" button is present while disconnected...
    const connectButton = page.getByRole('button', {
      name: /^connect( login)?$/i,
    })
    await expect(connectButton).toBeVisible({ timeout: 15_000 })

    await connectWithPrivyTestAccount(page)

    // ...and gone once Privy login completes and wagmi reports connected.
    await expect(connectButton).not.toBeVisible({ timeout: 30_000 })
  })
})
