import type { Page } from '@playwright/test'
import { test, expect } from '../../../fixtures/playwright.fixture.js'

async function navigateToEditProfile(page: Page) {
  const searchInput = page.getByPlaceholder('Search name, address...').first()
  await searchInput.waitFor({ state: 'visible', timeout: 15_000 })
  await searchInput.click()
  await searchInput.fill('primetest.eth')
  await page
    .locator('[data-radix-popper-content-wrapper]')
    .getByRole('link', { name: /primetest\.eth/ })
    .click()
  await page.waitForURL(/\/p\/primetest\.eth$/, { timeout: 15_000 })
  await page.getByRole('link', { name: /edit profile/i }).click()
  await page.waitForURL(/\/p\/primetest\.eth\/edit/, { timeout: 15_000 })
}

test.describe('ENS primary name', () => {
  test.describe.configure({ timeout: 300_000 })

  test('Set primary name', async ({ authenticatedPage: page }) => {
    await navigateToEditProfile(page)

    await page.getByRole('button', { name: /set primary name/i }).click()
    await page.getByRole('button', { name: /set as primary/i }).click()

    // $ anchor ensures we wait for navigation away from /edit, not the current URL
    await page.waitForURL(/\/p\/primetest\.eth$/, { timeout: 120_000 })
  })

  test('Removing ETH address from Para primary name', async ({ authenticatedPage: page }) => {
    await navigateToEditProfile(page)

    // Set up listener BEFORE triggering the action to avoid missing the event
    const txDone = page.waitForEvent('console', {
      predicate: (msg) => msg.text().includes('[SAVE_RECORDS] Transaction completed:'),
      timeout: 90_000,
    })

    await page.getByRole('button', { name: 'Remove Ethereum' }).click()
    await page.getByRole('button', { name: /save changes/i }).click()
    await page
      .locator('[role="dialog"]')
      .getByRole('button', { name: /save changes/i })
      .click()

    await txDone

    await expect(page.getByText('Profile updated')).toBeVisible({ timeout: 10_000 })
  })
})
