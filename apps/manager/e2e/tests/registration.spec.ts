import { expect, test } from '../fixtures/stagehand.fixture.js'
import { createConsoleMonitor } from '../helpers/console-monitor.js'
import { fillParaEmailInput, sleep } from '../helpers/wait-helpers.js'

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
    await sleep(2000)

    await stagehand.act('Click the "Connect" button in the top right.')
    await sleep(2500)

    // Shadow DOM: act() fails on cpsl-input, so fill via evaluate
    await fillParaEmailInput(page, PARA_EMAIL)
    await sleep(2000)

    await new Promise((resolve) => setTimeout(resolve, 2533))
    // Step 3: User-recorded click action
    console.log(
      'Performing action: Click the email input field to enter credentials.',
    )
    // xpath=//input[@id="cpsl-input-0"]
    await stagehand.act('Click the email input field to enter credentials.')

    // Shadow DOM: arrow button inside cpsl-input
    // await clickParaEmailContinueButton(page)
    // await sleep(10000)
    await new Promise((resolve) => setTimeout(resolve, 1920))
    // Step 7: User-recorded click action
    console.log('Performing action: Click the email submission arrow button.')
    // xpath=/div/svg
    await stagehand.act('Click the email submission arrow button.')

    await new Promise((resolve) => setTimeout(resolve, 10000))
    // Step 8: Click first verification code input in the Verify Email modal (not the main page search)
    await stagehand.act(
      `Click the first verification code input field in the "Verify Email" modal dialog.`,
    )
    await sleep(805)

    // Step 9: Type PIN into the verification code field in the modal (not the name search box)
    await stagehand.act(
      `Type "${PARA_PIN}" into the verification code input in the "Verify Email" modal, not into the search box.`,
    )

    await new Promise((resolve) => setTimeout(resolve, 10000))
    // Step 10: User-recorded click action
    console.log(`Performing action: Click the "Sign in with Wallet" button.`)
    await stagehand.act('Click the "Sign in with Wallet" button.')

    await new Promise((resolve) => setTimeout(resolve, 10000))
    // Step 11: User-recorded click action
    await stagehand.act('Click the search input field to search names.')
    const nameOnly = DOMAIN_TO_REGISTER.replace(/\.eth$/i, '')
    await stagehand.act(
      'Type "%nameOnly%" into the header search input field.',
      {
        variables: { nameOnly },
      },
    )
    await sleep(4000)

    await stagehand.act('Click the "%domain%" search result item.', {
      variables: { domain: DOMAIN_TO_REGISTER },
    })
    await sleep(6300)

    // Select 2 years for registration: expiration two years from current year, total $10 USD
    await stagehand.act(
      'Change the registration duration to 2 years so the expiration date is two years from the current year and the total cost shows $10 USD.',
    )
    await sleep(2000) // allow total to update

    await stagehand.act('Click the "Pay with Stablecoins" button.')
    await sleep(2000)

    await stagehand.act('Click the USDC coin selection option.')
    await sleep(2400)

    await stagehand.act('Click the "Confirm Payment" button to proceed.')
    await sleep(2000)

    // Start console monitor before BUY NAME so we capture all registration logs
    const monitor = createConsoleMonitor(page, {
      onStateChange: (state, allStates) => {
        console.log(`[Registration] ${state} (seen: ${allStates.join(' → ')})`)
      },
    })

    await stagehand.act('Click the "BUY NAME" button to complete registration.')

    // Wait for registration to complete, checking console logs for transaction manager state
    await monitor.waitForRegistrationComplete(120_000)
    expect(monitor.getLastState()).toBe('success')
  })
})
