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
