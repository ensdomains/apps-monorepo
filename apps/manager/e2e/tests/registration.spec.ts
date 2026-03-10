import { expect, test } from '../fixtures/stagehand.fixture.js'
import { createConsoleMonitor } from '../helpers/console-monitor.js'
import { fillParaEmailInput } from '../helpers/wait-helpers.js'

const MANAGER_APP_URL = process.env.MANAGER_APP_URL ?? 'http://localhost:3000'
const PARA_EMAIL = process.env.PARA_E2E_EMAIL ?? 'test1@test.getpara.com'
const PARA_PIN = process.env.PARA_E2E_PIN ?? '123456'
// Unique name per run unless E2E_DOMAIN is set. Use a fixed domain (e.g. e2e-ci.eth) to get
// cache reuse for registration-page steps, since the cache key includes the page URL.
const DOMAIN_TO_REGISTER =
  process.env.E2E_DOMAIN ?? `e2e-${Date.now().toString(36)}.eth`

/**
 * Simple registration flow: stagehand.act() directly (no cached wrapper).
 * Para modal Shadow DOM steps use evaluate helpers (email fill, arrow button).
 */
test.describe('ENS name registration', () => {
  test('registers a name via Para wallet and stablecoin payment', async ({
    stagehand,
  }) => {
    const page = stagehand.context.pages()[0]
    if (!page) throw new Error('No page in Stagehand context')

    await page.goto(MANAGER_APP_URL)
    await page
      .waitForLoadState('networkidle', { timeout: 10000 })
      .catch(() => {})

    await stagehand.act('Click the "Connect" button in the top right.')
    await stagehand.act('Wait until you see the Para modal.')

    await fillParaEmailInput(page, PARA_EMAIL)

    await stagehand.act('Wait until you see the email submission arrow button.')
    await stagehand.act('Click the email submission arrow button.')

    await stagehand.act(
      'Wait until you see the first verification code input field in the Verify Email modal.',
    )
    await stagehand.act(
      `Click the first verification code input field in the "Verify Email" modal dialog.`,
    )

    await stagehand.act(
      `Type "${PARA_PIN}" into the verification code input in the "Verify Email" modal, not into the search box.`,
    )

    await page
      .waitForLoadState('networkidle', { timeout: 10000 })
      .catch(() => {})

    await stagehand.act('Wait until you see the "Verify your wallet" modal.')
    const [SignInWithWalletButton] = await stagehand.observe(
      'locate the "Sign in with Wallet" button in the "Verify your wallet" modal',
    )
    if (SignInWithWalletButton) {
      await stagehand.act(SignInWithWalletButton)
    } else {
      await stagehand.act(
        'Click the "Sign in with Wallet" button in the "Verify your wallet" modal.',
      )
    }

    await stagehand.act(
      'Wait until you see the search input field to search names.',
    )
    await stagehand.act('Click the search input field to search names.')
    const nameOnly = DOMAIN_TO_REGISTER.replace(/\.eth$/i, '')
    await stagehand.act(
      'Type "%nameOnly%" into the header search input field.',
      {
        variables: { nameOnly },
      },
    )

    await stagehand.act('Click the "%domain%" search result item.', {
      variables: { domain: DOMAIN_TO_REGISTER },
    })

    await stagehand.act(
      'Change the registration duration to 2 years so the expiration date is two years from the current year and the total cost shows $10 USD.',
    )

    await stagehand.act('Click the "Pay with Stablecoins" button.')

    await stagehand.act('Click the USDC coin selection option.')

    await stagehand.act('Click the "Confirm Payment" button to proceed.')

    const monitor = createConsoleMonitor(page, {
      onStateChange: (state, allStates) => {
        console.log(`[Registration] ${state} (seen: ${allStates.join(' → ')})`)
      },
    })

    await stagehand.act('Click the "BUY NAME" button to complete registration.')

    await monitor.waitForRegistrationComplete(120_000)
    expect(monitor.getLastState()).toBe('success')

    const successBanner = () =>
      page.evaluate(
        () =>
          document
            .querySelector('p.text-ens-peridot-text-dark')
            ?.textContent?.includes('Registration Complete') ?? false,
      )
    await expect.poll(successBanner, { timeout: 30_000 }).toBe(true)
  })
})
