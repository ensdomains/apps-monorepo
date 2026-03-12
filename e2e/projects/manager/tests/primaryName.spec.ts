import { test } from '@playwright/test'
import { authenticateWithPara } from '../../../helpers/para-auth.js'

const MANAGER_APP_URL = process.env.MANAGER_APP_URL ?? 'http://localhost:3000'
const PARA_EMAIL = process.env.PARA_E2E_EMAIL ?? 'test1@test.getpara.com'
const PARA_PIN = process.env.PARA_E2E_PIN ?? '123456'

/** Wait for a console message matching a pattern. Set up BEFORE the triggering action. */
function waitForConsolePattern(
  page: { on(event: 'console', handler: (msg: { text(): string }) => void): void },
  pattern: string,
  timeoutMs: number,
): Promise<void> {
  return new Promise((resolve, reject) => {
    let done = false
    const id = setTimeout(() => {
      if (!done) reject(new Error(`Timeout waiting for console: "${pattern}"`))
    }, timeoutMs)
    page.on('console', (msg) => {
      if (!done && msg.text().includes(pattern)) {
        done = true
        clearTimeout(id)
        resolve()
      }
    })
  })
}

test.describe.skip('ENS primary name', () => {
  test('Setting a primary name through Para', async ({ page }) => {
    test.setTimeout(300_000)

    // Navigate and authenticate
    await page.goto(MANAGER_APP_URL)
    await page.waitForLoadState('networkidle').catch(() => {})
    await authenticateWithPara(page, { email: PARA_EMAIL, pin: PARA_PIN })
    await page.waitForLoadState('networkidle').catch(() => {})

    // Search for primetest.eth and navigate to its profile
    const searchInput = page.getByPlaceholder(/search/i)
    await searchInput.waitFor({ state: 'visible', timeout: 15_000 })
    await searchInput.click()
    await searchInput.fill('primetest.eth')
    await page.getByText('primetest.eth').click()

    // Go to Edit Profile page
    await page.getByRole('button', { name: /edit profile/i }).click()

    // Set the primary name
    await page.getByRole('button', { name: /set primary name/i }).click()

    // Set up console listeners BEFORE clicking "Set as Primary"
    const tx1Done = waitForConsolePattern(
      page,
      '[SAVE_RECORDS] Transaction completed:',
      60_000,
    )
    const tx2Done = waitForConsolePattern(
      page,
      '[PRIMARY NAME] Cleared snapshot',
      90_000,
    )

    // Click "Set as Primary"
    await page.getByRole('button', { name: /set as primary/i }).click()

    await tx1Done
    console.log('[PrimaryName] Tx 1 complete: ETH address record updated')

    await tx2Done
    console.log('[PrimaryName] Tx 2 complete: Primary name set')
  })

  test('Removing ETH address from Para primary name', async ({ page }) => {
    test.setTimeout(300_000)

    // Navigate and authenticate
    await page.goto(MANAGER_APP_URL)
    await page.waitForLoadState('networkidle').catch(() => {})
    await authenticateWithPara(page, { email: PARA_EMAIL, pin: PARA_PIN })
    await page.waitForLoadState('networkidle').catch(() => {})

    // Search for primetest.eth and navigate to its profile
    const searchInput = page.getByPlaceholder(/search/i)
    await searchInput.waitFor({ state: 'visible', timeout: 15_000 })
    await searchInput.click()
    await searchInput.fill('primetest.eth')
    await page.getByText('primetest.eth').click()

    // Click Edit Profile
    await page.getByRole('button', { name: /edit profile/i }).click()
    await page.waitForLoadState('networkidle').catch(() => {})

    // Set up console listener BEFORE removing the record
    const txDone = waitForConsolePattern(
      page,
      '[SAVE_RECORDS] Transaction completed:',
      90_000,
    )

    // Remove the Ethereum address record
    await page.waitForSelector('[aria-label="Remove Ethereum"]', {
      state: 'visible',
    })
    await page.locator('[aria-label="Remove Ethereum"]').click()

    // Click save button (trigger icon)
    await page
      .locator('button[data-slot="dialog-trigger"]:has(.lucide-save)')
      .click()

    // Confirm in dialog
    await page.waitForSelector('[role="dialog"]', { state: 'visible' })
    await page.locator('button[data-slot="button"]:has(.lucide-save)').click()

    await txDone
    console.log('[ETHRecord] Transaction complete: ETH record removed')
  })
})
