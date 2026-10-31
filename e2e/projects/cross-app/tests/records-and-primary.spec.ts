/**
 * Records and primary names, written in one app and read in the other
 * (scenarios X5 and X8; e2e-gap-analysis.md §2.2).
 *
 * X5: a record saved in the manager shows in the explorer, and one saved in
 *     the explorer shows in the manager.
 * X8: a primary name set in the manager is the address's name in the explorer
 *     and on chain (UniversalResolver reverse resolution).
 */
import { getName } from '@ensdomains/ensjs/public'
import type { Page } from '@playwright/test'
import type { Address } from 'viem'

import {
  expect,
  MANAGER_APP_URL,
  PORTAL_APP_URL,
  test,
} from '../../../fixtures/playwright.cross-app.fixture.js'
import { publicClient } from '../../../helpers/anvil-client.js'
import {
  isRealBigname,
  waitForBignameBlock,
} from '../../../helpers/bigname-sync.js'
import { authorizeTransaction } from '../../../helpers/manager-auth.js'
import { openPrimaryNamePicker } from '../../../helpers/primary-name.js'
import {
  saveProfileChanges,
  waitForProfileUpdated,
} from '../../../helpers/profile-helpers.js'
import { expectRecordsResolve } from '../../../helpers/resolve-records.js'
import { driveTransactionsToSuccess } from '../../../helpers/transaction-modal.js'

/** `apps/portal/src/routes/$name/edit-records.tsx`. */
const SAVE_RECORDS_TX = 'tx-save-resolver-records'

const unique = (tag: string) => `${tag} ${Date.now().toString(36)}`

/** The explorer's records page for `name` shows `value`. */
async function expectExplorerShows(page: Page, name: string, value: string) {
  await page.goto(`${PORTAL_APP_URL}/${name}/records`)
  await expect(
    page.getByText(value, { exact: true }),
    `the explorer does not show the record the manager saved on ${name}`,
  ).toBeVisible({ timeout: 30_000 })
}

/** The manager's profile page for `name` shows `value`. */
async function expectManagerShows(page: Page, name: string, value: string) {
  await page.goto(`${MANAGER_APP_URL}/${name}`)
  await expect(
    page.getByText(value, { exact: true }),
    `the manager does not show the record the explorer saved on ${name}`,
  ).toBeVisible({ timeout: 30_000 })
}

// Both apps read bigname, and the cross-app fixture installs no route mock,
// so a mocked run (nightly CI) cannot see the names these tests seed.
test.beforeEach(() =>
  test.skip(
    !isRealBigname,
    'Cross-app records and primary name require real bigname',
  ),
)

test.describe('Records written in one app, read in the other', () => {
  test.describe.configure({ timeout: 300_000 })

  test('a description saved in the manager shows in the explorer', {
    tag: ['@scenario:X5'],
  }, async ({ explorer, manager, makeV2Name }) => {
    const name = await makeV2Name({ label: 'x5-mgr' })
    const description = unique('from the manager')

    await manager.page.goto(`${MANAGER_APP_URL}/${name}`)
    await manager.page.getByRole('button', { name: 'Edit Profile' }).click()
    await manager.page.getByPlaceholder('Description').fill(description)
    await saveProfileChanges(manager.page, manager.wallet)
    await waitForProfileUpdated(manager.page)
    // On chain first: the write landed.
    await expect
      .poll(
        async () => {
          try {
            await expectRecordsResolve(name, {
              texts: [{ key: 'description', value: description }],
            })
            return true
          } catch {
            return false
          }
        },
        { timeout: 30_000 },
      )
      .toBe(true)
    await waitForBignameBlock()

    await expectExplorerShows(explorer.page, name, description)
  })

  test('a description saved in the explorer shows in the manager', {
    tag: ['@scenario:X5'],
  }, async ({ explorer, manager, makeV2Name }) => {
    // A seeded record gives the name its own resolver the owner can write to.
    const name = await makeV2Name({
      label: 'x5-exp',
      records: [{ key: 'url', value: 'https://example.com/x5' }],
    })
    const description = unique('from the explorer')

    const { page, wallet } = explorer
    await page.goto(`${PORTAL_APP_URL}/${name}/edit-records`)
    await page.getByLabel('Type', { exact: true }).selectOption('text')
    await page.getByLabel('Key', { exact: true }).fill('description')
    await page.getByLabel('Value', { exact: true }).fill(description)
    await page.getByRole('button', { name: 'Add record' }).click()
    await page
      .getByRole('button', { name: 'Save 1 change' })
      .click({ timeout: 20_000 })
    await driveTransactionsToSuccess(page, wallet, [SAVE_RECORDS_TX])
    await expectRecordsResolve(name, {
      texts: [{ key: 'description', value: description }],
    })
    await waitForBignameBlock()

    await expectManagerShows(manager.page, name, description)
  })
})

test.describe('A primary name set in the manager, seen in the explorer', () => {
  test.describe.configure({ timeout: 300_000 })

  test('the explorer and the chain both resolve the address to the new primary name', {
    tag: ['@scenario:X8'],
  }, async ({ explorer, manager, accounts, makeV2Name }) => {
    const address = accounts.getAddress('user') as Address
    const name = await makeV2Name({ label: 'x8-primary' })

    const { page } = manager
    const dialog = await openPrimaryNamePicker(page, address)
    await dialog
      .getByPlaceholder('Search names')
      .fill(name.replace(/\.eth$/, ''))
    await dialog
      .getByRole('button', { name: `Select ${name} as primary name` })
      .click({ timeout: 30_000 })
    await dialog.getByRole('button', { name: 'Set as Primary' }).click()
    // Then "Set this as your primary name?" — it also offers to point the
    // name's ETH record at the wallet when it has none.
    const confirm = page
      .getByRole('alertdialog', { name: /set this as your primary name/i })
      .getByRole('button', { name: 'Confirm' })
    // With no ETH record yet, the manager first writes one as a plain
    // transaction from the owner's wallet (not an auto-approved intent).
    await Promise.all([
      confirm.click({ timeout: 30_000 }),
      authorizeTransaction(manager.wallet, 60_000),
    ])

    // On chain: reverse resolution through the UniversalResolver.
    await expect
      .poll(
        async () =>
          (
            await getName(publicClient as never, { address } as never).catch(
              () => null,
            )
          )?.name ?? null,
        { timeout: 120_000, intervals: [2_000] },
      )
      .toBe(name)

    // The explorer names the account by it.
    await explorer.page.goto(`${PORTAL_APP_URL}/addr/${address}`)
    await expect(
      explorer.page.getByText(name, { exact: true }).first(),
      'the explorer does not show the primary name the manager set',
    ).toBeVisible({ timeout: 30_000 })
  })
})
