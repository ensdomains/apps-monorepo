import type { Page } from '@playwright/test'
import { test, expect } from '../../../fixtures/playwright.manager.fixture.js'
import { findSearchInput } from '../../../helpers/search-input.js'

async function viewProfile(page: Page) {
  const searchInput = await findSearchInput(page)
  await searchInput.click()
  await searchInput.fill('primetest.eth')
  await page
    .locator('[data-radix-popper-content-wrapper]')
    .getByRole('link', { name: /primetest\.eth/ })
    .click()
  await page.waitForURL(/\/p\/primetest\.eth$/, { timeout: 15_000 })
  // Let React hydration / data-fetch re-renders settle before interacting
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(2_000)

  const viewProfileLink = page.getByText('View profile')
  const editProfileLink = page.getByText('Edit Profile')
  if (await viewProfileLink.isVisible({ timeout: 15_000 })) {
    await expect(viewProfileLink).toBeVisible()
    await viewProfileLink.click()
  }
  if (await editProfileLink.isVisible({ timeout: 15_000 })) {
    await expect(editProfileLink).toBeVisible()
    await editProfileLink.click()
  }
}

test.describe('ENS primary name', () => {
  test.describe.configure({ timeout: 300_000 })

  test('Set primary name', async ({ authenticatedPage: page }) => {
    await viewProfile(page)

    await page.getByRole('button', { name: /set primary name/i }).click()
    await page.getByRole('button', { name: /set as primary/i }).click()

    // $ anchor ensures we wait for navigation away from /edit, not the current URL
    await page.waitForURL(/\/p\/primetest\.eth$/, { timeout: 120_000 })

    // click on view profile link
    // await page.getByText('View Profile').click()
    // await page.waitForURL(/\/p\/primetest\.eth$/, { timeout: 120_000 })

    // edit profile link should be visible
    const editProfileLink = page.getByText('Edit Profile')
    if (await editProfileLink.isVisible({ timeout: 15_000 })) {
      await editProfileLink.click()
    }

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

    await txDone

    await expect(page.getByText('Profile updated')).toBeVisible({ timeout: 10_000 })

  })
})
