import type { Page } from '@playwright/test'

/** Picks wallet USDC, unless an existing balance covers the payment and the picker shows no methods. */
export async function selectUsdcIfNeeded(page: Page) {
  const selectUsdc = page.getByRole('button', {
    name: 'Select USDC',
    exact: true,
  })
  await selectUsdc
    .or(page.getByText(/No additional payment needed/))
    .first()
    .waitFor()
  if (await selectUsdc.isVisible()) await selectUsdc.click()
}
