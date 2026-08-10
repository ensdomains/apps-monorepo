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

import {
  getAddressRecord,
  getContentHashRecord,
  getTextRecord,
} from '@ensdomains/ensjs/public'
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

const readAddr = (name: string, coin: string) =>
  getAddressRecord(publicClient as never, { name, coin } as never) as Promise<{
    value: string
  } | null>

const readContentHash = (name: string) =>
  getContentHashRecord(publicClient as never, { name } as never)

/**
 * Pick a coin in the `CoinSelect` popover. It is a search-and-click list, not
 * a native select, so the coin has to be filtered to before it is clickable.
 */
async function selectCoin(page: import('@playwright/test').Page, coin: string) {
  // Three elements carry role=combobox here — the header search (an input),
  // the Type picker (a native select) and this one. Only CoinSelect renders
  // its trigger as a button, and it exposes no accessible name, so the
  // element type is what distinguishes it.
  await page.locator('button[role="combobox"]').click()
  await page.getByPlaceholder('Search coins...').fill(coin)
  await page
    .getByRole('button', { name: new RegExp(`^${coin}\\b`, 'i') })
    .first()
    .click()
}

/** Queue one address record in the editor. Does not save. */
async function addAddressRecord(
  page: import('@playwright/test').Page,
  coin: string,
  value: string,
) {
  await page.getByLabel('Type', { exact: true }).selectOption('address')
  await selectCoin(page, coin)
  await page.getByLabel('Value', { exact: true }).fill(value)
  await page.getByRole('button', { name: 'Add record' }).click()
}

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
  test('blocks record editing for a wallet with no resolver roles', {
    tag: ['@scenario:E5'],
  }, async ({ portalPage: page, wallet, makeName, wallets }) => {
    await connectWithHeadlessWallet(page, wallet)

    const name = await makeName({
      label: 'rec-e5',
      owner: 'user',
      records: [{ key: 'description', value: 'owner only' }],
    })

    await wallets.switchTo('stranger')
    await page.goto(`${PORTAL_APP_URL}/${name}/edit-records`)

    // The guard must be the editor refusing to open, not the chain rejecting
    // a transaction — "blocked" has to mean no transaction is constructible.
    await expect(
      page.getByText(/don't have permission to edit records/i),
      'a wallet with no resolver roles must be refused up front',
    ).toBeVisible({ timeout: 30_000 })
    await expect(
      page.getByRole('button', { name: 'Add record' }),
      'the editor controls must not be reachable at all',
    ).toHaveCount(0)

    expect(
      await readText(name, 'description'),
      'the existing record must be untouched',
    ).toBe('owner only')
  })

  test('sets address records for an EVM and a non-EVM coin', {
    tag: ['@scenario:E2'],
  }, async ({ portalPage: page, wallet, makeName, wallets }) => {
    await connectWithHeadlessWallet(page, wallet)

    const name = await makeName({
      label: 'rec-e2',
      owner: 'user',
      records: [{ key: 'seed', value: 'dedicated-resolver' }],
    })
    const evm = wallets.address('manager')
    const btc = '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa'

    await page.goto(`${PORTAL_APP_URL}/${name}/edit-records`)
    await addAddressRecord(page, 'ETH', evm)
    await addAddressRecord(page, 'BTC', btc)

    await page
      .getByRole('button', { name: 'Save 2 changes' })
      .click({ timeout: 20_000 })
    await driveTransactionsToSuccess(page, wallet, [SAVE_RECORDS_TX])

    // Both coin types must round-trip: a non-EVM address is encoded
    // differently on-chain, so ETH passing says nothing about BTC.
    expect(
      (await readAddr(name, 'ETH'))?.value?.toLowerCase(),
      'addr(60) should hold the EVM address that was entered',
    ).toBe(evm.toLowerCase())
    expect(
      (await readAddr(name, 'BTC'))?.value,
      'addr(0) should hold the BTC address that was entered',
    ).toBe(btc)
  })

  test('sets a contenthash record', { tag: ['@scenario:E4'] }, async ({
    portalPage: page,
    wallet,
    makeName,
  }) => {
    await connectWithHeadlessWallet(page, wallet)

    const name = await makeName({
      label: 'rec-e4',
      owner: 'user',
      records: [{ key: 'seed', value: 'dedicated-resolver' }],
    })
    const ipfs =
      'ipfs://bafybeico3uuyj3vphxpvbowchdwjlrlrh62awxscrnii7w7flu5z6fk77y'

    await page.goto(`${PORTAL_APP_URL}/${name}/edit-records`)
    // Contenthash is keyless — type and value only.
    await page.getByLabel('Type', { exact: true }).selectOption('contentHash')
    await page.getByLabel('Value', { exact: true }).fill(ipfs)
    await page.getByRole('button', { name: 'Add record' }).click()

    await page
      .getByRole('button', { name: 'Save 1 change' })
      .click({ timeout: 20_000 })
    await driveTransactionsToSuccess(page, wallet, [SAVE_RECORDS_TX])

    const stored = await readContentHash(name)
    expect(
      stored,
      'the resolver should hold a contenthash after saving one',
    ).toBeTruthy()
    expect(
      `${(stored as { protocolType?: string; decoded?: string }).protocolType}://${(stored as { decoded?: string }).decoded}`,
      'contenthash should round-trip the IPFS CID that was entered',
    ).toBe(ipfs)
  })
})
