import type { Page } from '@playwright/test'
import { expect } from '@playwright/test'

/** Picks USDC when the dialog offers a token; a fully covered payment hides the picker. */
export async function selectUsdcIfOffered(page: Page) {
  const select = page.getByRole('button', { name: 'Select USDC' })
  const covered = page.getByText(/fully covered/i)
  await expect(select.or(covered).first()).toBeVisible({ timeout: 60_000 })
  if (await select.isVisible()) await select.click()
}
