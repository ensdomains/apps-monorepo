import type { Page } from '@playwright/test'
import { test, expect } from '../../../fixtures/playwright.manager.fixture.js'

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

test.describe.skip('ENS primary name', () => {
  test.describe.configure({ timeout: 300_000 })

  test('Set primary name', async ({ connectedPage: page, makeV2Name }) => {
    const name = await makeV2Name({ label: 'primetest' })
    console.log(`[primaryName] name for set-primary test: ${name}`)

    await viewProfile(page, name)

    await page.getByRole('button', { name: /set primary name/i }).click()
    // In Rhinestone HCA mode both steps (set ETH address record + set primary
    // name) are eth_signTypedData_v4 intents, auto-authorized via
    // PERMITTED_SIGN_KINDS. Wait for the success navigation that
    // usePrimaryNameSuccessRedirect triggers instead of authorizing txs.
    await page.getByRole('button', { name: /set as primary/i }).click()
    const escapedName = name.replaceAll('.', String.raw`\.`)
    await page.waitForURL(new RegExp(`/${escapedName}$`), { timeout: 120_000 })

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
    // In Rhinestone mode: profile record saves are eth_signTypedData_v4 intents,
    // auto-authorized. txDone waits for the [SAVE_RECORDS] console log.
    await txDone

    await expect(page.getByText('Profile updated')).toBeVisible({ timeout: 10_000 })

  })
})
