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
  test('sets and clears a primary name via Para wallet', async ({
    stagehand,
  }) => {
    // Login (~66s) + navigation (~15s) + tx1 (60s) + tx2 (90s) needs > 240s
    test.setTimeout(300_000)

    const page = stagehand.context.pages()[0]
    if (!page) throw new Error('No page in Stagehand context')

    await page.goto(MANAGER_APP_URL)
    await page.waitForLoadState('networkidle', 10000).catch(() => {})
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

    await stagehand.act('click the search bar at the top')
    await stagehand.act('type "primetest.eth" into the search bar')
    await stagehand.act('click on the primetest.eth search result')
    await stagehand.act('click the Edit Profile button')
    await stagehand.act('click the Set Primary Name button')

    // Set up console watchers before clicking so we don't miss fast messages.
    // Tx 1: saveRecords sets the ETH address record on the resolver.
    // Tx 2: primary name machine sets the reverse record.
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

  test('removes ETH record from profile via Para wallet', async ({
    stagehand,
  }) => {
    test.setTimeout(300_000)

    const page = stagehand.context.pages()[0]
    if (!page) throw new Error('No page in Stagehand context')

    await page.goto(MANAGER_APP_URL)
    await page.waitForLoadState('networkidle', 10000).catch(() => {})
    await sleep(2000)

    await stagehand.act('Click the "Connect" button in the top right.')
    await sleep(2500)

    await fillParaEmailInput(page, PARA_EMAIL)
    await sleep(2000)

    await new Promise((resolve) => setTimeout(resolve, 2533))
    console.log(
      'Performing action: Click the email input field to enter credentials.',
    )
    await stagehand.act('Click the email input field to enter credentials.')

    await new Promise((resolve) => setTimeout(resolve, 1920))
    console.log('Performing action: Click the email submission arrow button.')
    await stagehand.act('Click the email submission arrow button.')

    await new Promise((resolve) => setTimeout(resolve, 10000))
    await stagehand.act(
      `Click the first verification code input field in the "Verify Email" modal dialog.`,
    )
    await sleep(805)

    await stagehand.act(
      `Type "${PARA_PIN}" into the verification code input in the "Verify Email" modal, not into the search box.`,
    )

    await new Promise((resolve) => setTimeout(resolve, 10000))
    console.log(`Performing action: Click the "Sign in with Wallet" button.`)
    await stagehand.act('Click the "Sign in with Wallet" button.')

    await new Promise((resolve) => setTimeout(resolve, 10000))

    // Navigate to primetest.eth and remove the ETH address record
    await stagehand.act('type primetest.eth into the search bar')
    await stagehand.act(
      'click on the primetest.eth result with the Registered label',
    )
    await stagehand.act('click the Edit Profile button')
    await page.waitForLoadState('networkidle', 15_000).catch(() => {})

    // Step 12: click on the Ethereum field to select it
    console.log('Performing action: click on the Ethereum field to select it')
    // xpath=/html[1]/body[1]/div[1]/main[1]/div[1]/form[1]/div[2]/div[2]/div[1]/div[2]/div[1]/div[1]/div[1]/input[1]
    await stagehand.act('click on the Ethereum field to select it')

    // Step 13: click the Remove Ethereum button
    console.log('Performing action: click the Remove Ethereum button')
    // xpath=/html[1]/body[1]/div[1]/main[1]/div[1]/form[1]/div[2]/div[2]/div[1]/div[2]/div[1]/div[1]/button[1]
    await stagehand.act('click the Remove Ethereum button')

    await stagehand.act('click the Save Changes button')

    // Set up watcher before clicking Save so we don't miss fast messages
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

    await stagehand.act('click the Save Changes button in the modal')

    await txDone
    console.log('[ETHRecord] ✅ Transaction complete: ETH record removed')
  })
})
