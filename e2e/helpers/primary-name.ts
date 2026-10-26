/**
 * Open the manager's primary-name picker from its dashboard card. The current
 * name is display text; the card's "Primary Name" button is the entry point.
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
  _address: Address,
): Promise<Locator> {
  await page.goto(`${MANAGER_APP_URL}/dashboard`)
  await page.waitForLoadState('networkidle')
  // The nameplate is now text. The card's stable "Primary Name" button
  // opens the picker whether or not a reverse record has already been set.
  const trigger = page.getByRole('button', {
    name: /^(set primary name|primary name)$/i,
  })
  await trigger.first().click({ timeout: 30_000 })
  const dialog = page.getByRole('dialog', { name: 'Choose Primary Name' })
  await expect(dialog).toBeVisible()
  return dialog
}
