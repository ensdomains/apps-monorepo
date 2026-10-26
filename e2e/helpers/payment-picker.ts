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

/** Clicks the registration payment action, whichever label the payment state gives it. */
export async function clickRegistrationPaymentAction(page: Page) {
  await page
    .getByRole('dialog', { name: 'Approve and register name' })
    .getByRole('button', {
      name: /^(approve and register|sign payment approval|register name)$/i,
    })
    .click()
}
