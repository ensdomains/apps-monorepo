import { getOwner } from '@ensdomains/ensjs/public/v2'
import { privateKeyToAccount } from 'viem/accounts'
import { makeV2FourLD } from '../../../fixtures/makeV2FourLD.js'
import {
  asAccount,
  expect,
  MANAGER_APP_URL,
  PORTAL_APP_URL,
  test,
} from '../../../fixtures/playwright.cross-app.fixture.js'
import { publicClient } from '../../../helpers/anvil-client.js'
import {
  isRealBigname,
  waitForBignameName,
} from '../../../helpers/bigname-sync.js'
import { authorizeTransactionsWhile } from '../../../helpers/manager-auth.js'
import {
  openPrimaryNamePicker,
  readPrimaryName,
} from '../../../helpers/primary-name.js'
import { expectRecordsResolve } from '../../../helpers/resolve-records.js'
import {
  driveTransactionsToSuccess,
  transferTxId,
} from '../../../helpers/transaction-modal.js'

test.describe.configure({ timeout: 300_000 })
test.beforeEach(() =>
  test.skip(!isRealBigname, 'Native 4LD observers require real bigname'),
)

test('manager sets a native 4LD primary name visible in explorer', {
  tag: ['@scenario:Q57'],
}, async ({ manager, explorer, accounts }) => {
  const account = privateKeyToAccount(accounts.getPrivateKey('user'))
  const tree = await makeV2FourLD(account)
  const { page, wallet } = manager
  const dialog = await openPrimaryNamePicker(page, account.address)
  await dialog.getByPlaceholder('Search names').fill(tree.name)
  await dialog
    .getByRole('button', {
      name: `Select ${tree.name} as primary name`,
      exact: true,
    })
    .click()
  let done = false
  const signing = authorizeTransactionsWhile(page, wallet, () => done)
  try {
    // The forward address already matches: the ready path needs no ETH-update confirmation.
    await dialog
      .getByRole('button', { name: 'Set as Primary', exact: true })
      .click()
    await expect
      .poll(() => readPrimaryName(account.address), { timeout: 120_000 })
      .toBe(tree.name)
  } finally {
    done = true
    await signing
  }
  await expectRecordsResolve(tree.name, tree.records)
  await explorer.page.goto(`${PORTAL_APP_URL}/addr/${account.address}`)
  await expect(
    explorer.page.getByText(tree.name, { exact: true }).first(),
  ).toBeVisible()
})

test('native 4LD transfer changes both manager dashboard lists', {
  tag: ['@scenario:Q58', '@inv:INV3-native-4ld-lists'],
}, async ({ manager, explorer, accounts }) => {
  const tree = await makeV2FourLD(
    privateKeyToAccount(accounts.getPrivateKey('user')),
  )
  const recipient = accounts.getAddress('user2')
  const { page, wallet } = explorer
  await page.goto(`${PORTAL_APP_URL}/${tree.name}/ownership/transfer`)
  await page.getByPlaceholder('ENS name or address').fill(recipient)
  await page.locator('#transfer-option-detachResolver').uncheck()
  await page.getByRole('switch', { name: /Set the ETH address/ }).uncheck()
  await page.getByRole('button', { name: 'Transfer name', exact: true }).click()
  await driveTransactionsToSuccess(page, wallet, [
    transferTxId(tree.name, 'transfer-token-unsafe'),
  ])
  expect(await getOwner(publicClient, { name: tree.name })).toBe(recipient)
  await waitForBignameName(
    tree.name,
    (n) => n.owner?.toLowerCase() === recipient.toLowerCase(),
  )
  await manager.page.goto(`${MANAGER_APP_URL}/dashboard`)
  await manager.page.getByPlaceholder('Search my names').fill(tree.name)
  await expect(
    manager.page.getByText('No names to display', { exact: true }),
  ).toBeVisible()
  await asAccount(manager, accounts, 'user2')
  const welcome = manager.page.getByRole('dialog', {
    name: 'Welcome to the new ENS app!',
  })
  if (await welcome.isVisible())
    await welcome.getByRole('button', { name: 'Close', exact: true }).click()
  await manager.page.getByPlaceholder('Search my names').fill(tree.name)
  await expect(
    manager.page.getByRole('button', {
      name: `More options for ${tree.name}`,
      exact: true,
    }),
  ).toBeVisible()
  await expectRecordsResolve(tree.name, tree.records)
})
