/**
 * Open the manager's primary-name picker from the dashboard, whichever
 * control the dashboard shows: "Set primary name" when the account has none,
 * or the primary-name card's “Primary Name” button when
 * it has one (`features/dashboard/components/PrimaryNameCard.tsx`). The test
 * accounts are shared across a run, so either state is possible.
 */
import { getName } from '@ensdomains/ensjs/public'
import { expect, type Locator, type Page } from '@playwright/test'
import type { Address } from 'viem'

import { publicClient } from './anvil-client.js'

const MANAGER_APP_URL = process.env.MANAGER_APP_URL ?? 'http://localhost:3000'

/** The address's primary name on chain, via the UniversalResolver. */
export async function readPrimaryName(
  address: Address,
): Promise<string | null> {
  const result = await getName(
    publicClient as never,
    { address } as never,
  ).catch(() => null)
  return (result as { name?: string } | null)?.name ?? null
}

export async function openPrimaryNamePicker(
  page: Page,
  address: Address,
): Promise<Locator> {
  await page.goto(`${MANAGER_APP_URL}/dashboard`)
  await page.waitForLoadState('networkidle')
  const current = await readPrimaryName(address)
  // The nameplate is display-only; the card's labelled button opens the picker.
  // Avoid the header account menu, which also displays the primary name.
  const trigger = current
    ? page.getByRole('button', { name: 'Primary Name', exact: true })
    : page.getByRole('button', { name: /set primary name/i })
  await trigger.first().click({ timeout: 30_000 })
  const dialog = page.getByRole('dialog', { name: 'Choose Primary Name' })
  await expect(dialog).toBeVisible()
  return dialog
}
