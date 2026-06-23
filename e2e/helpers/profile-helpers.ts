import type { Page } from '@playwright/test'
import { expect } from '@playwright/test'

const MANAGER_APP_URL = process.env.MANAGER_APP_URL ?? 'http://localhost:3000'

export async function goToProfile(page: Page, name: string) {
  await page.goto(`${MANAGER_APP_URL}/p/${name}`)
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(2_000)
}

export async function goToEditProfile(page: Page, name: string) {
  await page.goto(`${MANAGER_APP_URL}/p/${name}/edit`)
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(3_000)
}

/**
 * Clicks a pill button to reveal a profile field if it isn't already mounted,
 * then asserts the field becomes visible.
 *
 * Bio/Website fields are pill-gated (not rendered until their pill is clicked).
 */
export async function ensureProfilePillField(
  page: Page,
  options: { pillName: RegExp; fieldLabel: string | RegExp },
) {
  const field = page.getByLabel(options.fieldLabel)
  if ((await field.count()) === 0) {
    await page.getByRole('button', { name: options.pillName }).click()
  }
  await expect(field).toBeVisible({ timeout: 10_000 })
}

/**
 * Clicks the main "Save Changes" button, waits for the diff dialog to appear,
 * then clicks the confirm button inside the dialog.
 */
export async function saveProfileChanges(page: Page) {
  await page.getByText('Save Changes').click()
  const confirmButton = page
    .locator('[role="dialog"]')
    .getByRole('button', { name: /save changes/i })
  await confirmButton.waitFor({ state: 'visible', timeout: 10_000 })
  await confirmButton.click()
}

export async function waitForProfileUpdated(page: Page, timeout = 90_000) {
  await expect(page.getByText('Profile updated')).toBeVisible({ timeout })
}

/**
 * On the renew page, selects the minimum 28-day duration via the custom date
 * picker, completes the USDC payment flow, and asserts the success screen shows
 * the correct expiry date. Returns the formatted expiry string (e.g. "June 29, 2026").
 */
export async function renewFor28Days(page: Page): Promise<string> {
  await page.getByRole('button', { name: /renew to date/i }).click()
  await page.getByRole('button', { name: 'Minimum' }).click()
  await page.locator('body').click({ position: { x: 10, y: 10 } })
  await page.waitForTimeout(500)

  const expiringOnText = await page.getByText(/expiring on /i).first().textContent()
  const dateMatch = expiringOnText?.match(
    /\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},\s+\d{4}\b/,
  )
  if (!dateMatch) throw new Error('Could not read expected expiry date from pricing summary')
  const expectedExpiry = dateMatch[0]

  await page.getByRole('button', { name: /pay with stablecoins/i }).click()
  await page.getByText('USDC', { exact: true }).click()
  await page.getByRole('button', { name: /renew name/i }).click()
  await page.getByRole('button', { name: /renew name/i }).click()

  await expect(page.getByText('Renewal Complete!')).toBeVisible({ timeout: 90_000 })
  await expect(page.getByText(expectedExpiry)).toBeVisible({ timeout: 5_000 })

  return expectedExpiry
}
