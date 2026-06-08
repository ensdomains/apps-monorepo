import type { Page } from '@playwright/test'
import { test, expect, authorizeTransaction } from '../../../fixtures/playwright.manager.fixture.js'

const MANAGER_APP_URL = process.env.MANAGER_APP_URL ?? 'http://localhost:3000'

async function viewProfile(page: Page, name: string) {
  // Navigate directly to the profile page — avoids search dropdown
  // flakiness caused by React re-renders detaching DOM elements in CI.
  // The app may redirect owned names to /p/{name}/edit, so accept both.
  const escapedName = name.replace(/\./g, '\\.')
  await page.goto(`${MANAGER_APP_URL}/p/${name}`)
  await page.waitForURL(new RegExp(`/p/${escapedName}(/edit)?$`), { timeout: 15_000 })
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(2_000)

  const viewProfileLink = page.getByText('View profile')
  const editProfileLink = page.getByText('Edit Profile')
  if (await viewProfileLink.isVisible({ timeout: 15_000 })) {
    await viewProfileLink.click()
  }
  if (await editProfileLink.isVisible({ timeout: 15_000 })) {
    await editProfileLink.click()
  }
}

test.describe('ENS primary name', () => {
  test.describe.configure({ timeout: 300_000 })

  test('Set primary name', async ({ connectedPage: page, makeV2Name, wallet }) => {
    const name = await makeV2Name({ label: 'primetest' })
    console.log(`[primaryName] name for set-primary test: ${name}`)

    await viewProfile(page, name)

    await page.getByRole('button', { name: /set primary name/i }).click()
    // "set as primary" sends 2 txs when no ETH address is set:
    // 1. set ETH address record  2. set primary name
    // Tx2 is only sent after tx1 confirms, so authorize sequentially.
    await page.getByRole('button', { name: /set as primary/i }).click()
    await authorizeTransaction(wallet, 90_000)
    await authorizeTransaction(wallet, 90_000)

    // Navigate directly to the edit profile page rather than waiting for
    // the dialog to auto-close — the dialog's close is driven by internal
    // timers that can be unreliable in the fake-clock environment.
    await page.goto(`${MANAGER_APP_URL}/p/${name}/edit`)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(2_000)

    // Set up listener BEFORE triggering the action to avoid missing the event
    const txDone = page.waitForEvent('console', {
      predicate: (msg) => msg.text().includes('[SAVE_RECORDS] Transaction completed:'),
      timeout: 90_000,
    })

    await page.getByRole('button', { name: 'Remove Ethereum' }).click()
    await page.getByText('Save Changes').click()
    await page
      .locator('[role="dialog"]')
      .getByRole('button', { name: /save changes/i })
      .click()
    await authorizeTransaction(wallet, 90_000)

    await txDone

    await expect(page.getByText('Profile updated')).toBeVisible({ timeout: 10_000 })

  })
})
