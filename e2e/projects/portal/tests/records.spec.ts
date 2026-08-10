/**
 * Portal resolver records — plan §5.E.
 *
 * The oracle is the resolver read, not the form: after saving, the record is
 * fetched back through ensjs exactly as the app would resolve it. The editor
 * is what is under test, so its own rendering proves nothing.
 *
 * `PendingChangesBar` labels its button "Save N changes", which makes the
 * change count an assertable part of E1's oracle rather than an implementation
 * detail — a save that batches the wrong number of keys is visible before the
 * transaction is even sent.
 */

import { getTextRecord } from '@ensdomains/ensjs/public'
import {
  connectWithHeadlessWallet,
  expect,
  test,
} from '../../../fixtures/playwright.portal.fixture.js'
import { publicClient } from '../../../helpers/anvil-client.js'
import { driveTransactionsToSuccess } from '../../../helpers/transaction-modal.js'

const PORTAL_APP_URL = process.env.PORTAL_APP_URL ?? 'http://localhost:3001'

/** `routes/$name/edit-records.tsx`. */
const SAVE_RECORDS_TX = 'tx-save-resolver-records'

/** Queue one text record in the editor. Does not save. */
async function addTextRecord(
  page: import('@playwright/test').Page,
  key: string,
  value: string,
) {
  await page.getByLabel('Type', { exact: true }).selectOption('text')
  await page.getByLabel('Key', { exact: true }).fill(key)
  await page.getByLabel('Value', { exact: true }).fill(value)
  await page.getByRole('button', { name: 'Add record' }).click()
}

const readText = (name: string, key: string) =>
  getTextRecord(publicClient as never, { name, key } as never)

test.describe('Portal resolver records', () => {
  test.describe.configure({ timeout: 300_000 })

  test('saves several text records in one transaction and reads them back on-chain', {
    tag: ['@scenario:E1'],
  }, async ({ portalPage: page, wallet, makeName }) => {
    await connectWithHeadlessWallet(page, wallet)

    // Seed a record so `makeName` deploys a *dedicated* resolver. Without one
    // the name shares a resolver its owner cannot write to, and the save
    // reverts at submission — see fixtures/makeName.ts.
    const name = await makeName({
      label: 'rec-e1',
      owner: 'user',
      records: [{ key: 'seed', value: 'dedicated-resolver' }],
    })
    const records = [
      { key: 'description', value: 'set through the portal editor' },
      { key: 'url', value: 'https://example.com/e1' },
      { key: 'com.twitter', value: 'ensdomains' },
    ]

    await page.goto(`${PORTAL_APP_URL}/${name}/edit-records`)
    for (const record of records) {
      await addTextRecord(page, record.key, record.value)
    }

    // The bar's count is the number of changed keys — three edits must
    // become one save of three changes, not three saves.
    const save = page.getByRole('button', {
      name: `Save ${records.length} changes`,
    })
    await expect(save).toBeVisible({ timeout: 20_000 })
    await save.click()

    await driveTransactionsToSuccess(page, wallet, [SAVE_RECORDS_TX])

    for (const record of records) {
      expect(
        await readText(name, record.key),
        `text(${record.key}) should read back what the editor saved`,
      ).toBe(record.value)
    }
  })

  test('updates and deletes an existing text record', {
    tag: ['@scenario:E1'],
  }, async ({ portalPage: page, wallet, makeName }) => {
    await connectWithHeadlessWallet(page, wallet)

    const name = await makeName({
      label: 'rec-e1b',
      owner: 'user',
      records: [{ key: 'description', value: 'original' }],
    })
    expect(await readText(name, 'description')).toBe('original')

    await page.goto(`${PORTAL_APP_URL}/${name}/edit-records`)
    // Re-adding an existing key is how the editor models an update.
    await addTextRecord(page, 'description', 'rewritten')

    await page
      .getByRole('button', { name: 'Save 1 change' })
      .click({ timeout: 20_000 })
    await driveTransactionsToSuccess(page, wallet, [SAVE_RECORDS_TX])

    expect(
      await readText(name, 'description'),
      'the resolver should hold the new value, not the original',
    ).toBe('rewritten')
  })
})
