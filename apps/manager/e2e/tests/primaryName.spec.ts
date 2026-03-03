import { test } from '../fixtures/stagehand.fixture.js'
import { fillParaEmailInput, sleep } from '../helpers/wait-helpers.js'

const MANAGER_APP_URL = process.env.MANAGER_APP_URL ?? 'http://localhost:3000'
const PARA_EMAIL = process.env.PARA_E2E_EMAIL ?? 'test1@test.getpara.com'
const PARA_PIN = process.env.PARA_E2E_PIN ?? '123456'
// Unique name per run unless E2E_DOMAIN is set. Use a fixed domain (e.g. e2e-ci.eth) to get
// cache reuse for registration-page steps, since the cache key includes the page URL.
/**
 * Simple registration flow: stagehand.act() directly (no cached wrapper).
 * Para modal Shadow DOM steps use evaluate helpers (email fill, arrow button).
 */
test.describe('ENS primary name', () => {
  test('Setting a primary name through Para', async ({ stagehand }) => {
    // Login (~66s) + navigation (~15s) + tx1 (60s) + tx2 (90s) needs > 240s
    test.setTimeout(300_000)

    const page = stagehand.context.pages()[0]
    if (!page) throw new Error('No page in Stagehand context')

    // Go to the Manager app
    await page.goto(MANAGER_APP_URL)
    await page.waitForLoadState('networkidle', 10000).catch(() => {})
    await sleep(2000)

    // Click the Connect button
    await stagehand.act('Click the "Connect" button in the top right.')
    await sleep(2500)

    // Enter log in details in the Para modal
    await fillParaEmailInput(page, PARA_EMAIL)
    await sleep(2000)
    await new Promise((resolve) => setTimeout(resolve, 2533))
    console.log(
      'Performing action: Click the email input field to enter credentials.',
    )
    await stagehand.act('Click the email input field to enter credentials.')

    // Submit the log in details
    await new Promise((resolve) => setTimeout(resolve, 1920))
    console.log('Performing action: Click the email submission arrow button.')
    await stagehand.act('Click the email submission arrow button.')

    // Enter verification code
    await new Promise((resolve) => setTimeout(resolve, 10000))
    await stagehand.act(
      `Click the first verification code input field in the "Verify Email" modal dialog.`,
    )
    await sleep(805)
    await stagehand.act(
      `Type "${PARA_PIN}" into the verification code input in the "Verify Email" modal, not into the search box.`,
    )

    // Click the "Sign in with Wallet" buttons
    await new Promise((resolve) => setTimeout(resolve, 10000))
    console.log(`Performing action: Click the "Sign in with Wallet" button.`)
    await stagehand.act('Click the "Sign in with Wallet" button.')

    await new Promise((resolve) => setTimeout(resolve, 10000))

    // Search for the name then go to it's profile
    await stagehand.act('click the search bar at the top')
    await stagehand.act('type "primetest.eth" into the search bar')
    await stagehand.act('click on the primetest.eth search result')

    // Go to the Edit Profile page
    await stagehand.act('click the Edit Profile button')

    // Set the primary name
    await stagehand.act('click the Set Primary Name button')

    const waitForConsolePattern = (pattern: string, timeoutMs: number) =>
      new Promise<void>((resolve, reject) => {
        let done = false
        const id = setTimeout(() => {
          if (!done)
            reject(new Error(`Timeout waiting for console: "${pattern}"`))
        }, timeoutMs)
        page.on('console', (msg) => {
          if (!done && msg.text().includes(pattern)) {
            done = true
            clearTimeout(id)
            resolve()
          }
        })
      })

    const tx1Done = waitForConsolePattern(
      '[SAVE_RECORDS] Transaction completed:',
      60_000,
    )
    const tx2Done = waitForConsolePattern(
      '[PRIMARY NAME] Cleared snapshot',
      90_000,
    )

    await stagehand.act('click the Set as Primary button')

    await tx1Done
    console.log('[PrimaryName] ✅ Tx 1 complete: ETH address record updated')

    await tx2Done
    console.log('[PrimaryName] ✅ Tx 2 complete: Primary name set')
  })

  test('Removing ETH address from Para primary name', async ({ stagehand }) => {
    // Login (~66s) + navigation (~15s) + tx1 (60s) + tx2 (90s) needs > 240s
    test.setTimeout(300_000)

    const page = stagehand.context.pages()[0]
    if (!page) throw new Error('No page in Stagehand context')

    // Go to the Manager app
    await page.goto(MANAGER_APP_URL)
    await page.waitForLoadState('networkidle', 10000).catch(() => {})
    await sleep(2000)

    // Click the Connect button
    await stagehand.act('Click the "Connect" button in the top right.')
    await sleep(2500)

    // Enter log in details in the Para modal
    await fillParaEmailInput(page, PARA_EMAIL)
    await sleep(2000)
    await new Promise((resolve) => setTimeout(resolve, 2533))
    console.log(
      'Performing action: Click the email input field to enter credentials.',
    )
    await stagehand.act('Click the email input field to enter credentials.')

    // Submit the log in details
    await new Promise((resolve) => setTimeout(resolve, 1920))
    console.log('Performing action: Click the email submission arrow button.')
    await stagehand.act('Click the email submission arrow button.')

    // Enter verification code
    await new Promise((resolve) => setTimeout(resolve, 10000))
    await stagehand.act(
      `Click the first verification code input field in the "Verify Email" modal dialog.`,
    )
    await sleep(805)
    await stagehand.act(
      `Type "${PARA_PIN}" into the verification code input in the "Verify Email" modal, not into the search box.`,
    )

    // Click the "Sign in with Wallet" buttons
    await new Promise((resolve) => setTimeout(resolve, 10000))
    console.log(`Performing action: Click the "Sign in with Wallet" button.`)
    await stagehand.act('Click the "Sign in with Wallet" button.')

    await new Promise((resolve) => setTimeout(resolve, 10000))

    // Search for the name then go to it's profile
    await stagehand.act('type primetest.eth into the search bar')
    await stagehand.act(
      'click on the primetest.eth result with the Registered label',
    )

    // Click the Edit Profile button
    await stagehand.act('click the Edit Profile button')
    await page.waitForLoadState('networkidle', 15_000).catch(() => {})

    console.log(
      'Performing action: click the X button next to the Ethereum address field to remove the ETH record',
    )
    const waitForConsolePattern = (pattern: string, timeoutMs: number) =>
      new Promise<void>((resolve, reject) => {
        let done = false
        const id = setTimeout(() => {
          if (!done)
            reject(new Error(`Timeout waiting for console: "${pattern}"`))
        }, timeoutMs)
        page.on('console', (msg) => {
          if (!done && msg.text().includes(pattern)) {
            done = true
            clearTimeout(id)
            resolve()
          }
        })
      })

    const txDone = waitForConsolePattern(
      '[SAVE_RECORDS] Transaction completed:',
      90_000,
    )

    // Remove the Ethereum address record and save
    await page.waitForSelector('[aria-label="Remove Ethereum"]', {
      state: 'visible',
    })
    await page.locator('[aria-label="Remove Ethereum"]').click()
    await page
      .locator('button[data-slot="dialog-trigger"]:has(.lucide-save)')
      .click()

    await page.waitForSelector('[role="dialog"]', { state: 'visible' })
    await page.locator('button[data-slot="button"]:has(.lucide-save)').click()

    await txDone
    console.log('[ETHRecord] ✅ Transaction complete: ETH record removed')
  })
})
