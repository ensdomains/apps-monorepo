import type { Page } from '@playwright/test'

/** Picks wallet USDC, unless an existing balance covers the payment and the sheet hides the methods. */
export async function selectUsdcIfNeeded(page: Page) {
  const selectUsdc = page.getByRole('button', {
    name: 'Select USDC',
    exact: true,
  })
  const fullyCovered = page
    .getByRole('region', { name: 'Payment summary' })
    .and(page.locator('[aria-busy="false"]'))
    .filter({ hasText: /You pay\s*\$0\.00/ })
  await selectUsdc.or(fullyCovered).first().waitFor()
  if (await selectUsdc.isVisible()) await selectUsdc.click()
}

/** Clicks the registration payment action, whichever label the payment state gives it. */
export async function clickRegistrationPaymentAction(page: Page) {
  await page
    .getByRole('dialog', { name: 'Approve and register name' })
    .getByRole('button', {
      name: /^(approve and register|sign approval|register name)$/i,
    })
    .click()
}
