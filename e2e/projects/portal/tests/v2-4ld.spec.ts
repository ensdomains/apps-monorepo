import { getTextRecord } from '@ensdomains/ensjs/public'
import { getOwner } from '@ensdomains/ensjs/public/v2'
import { type Address, labelhash, parseAbi } from 'viem'
import { makeV2FourLD } from '../../../fixtures/makeV2FourLD.js'
import {
  connectWithHeadlessWallet,
  expect,
  test,
} from '../../../fixtures/playwright.portal.fixture.js'
import { publicClient } from '../../../helpers/anvil-client.js'
import {
  isRealBigname,
  waitForBignameName,
} from '../../../helpers/bigname-sync.js'
import { expectRecordsResolve } from '../../../helpers/resolve-records.js'
import {
  accountHasRoles,
  ETH_REGISTRY,
} from '../../../helpers/role-assertions.js'
import {
  driveTransactionsToSuccess,
  transferTxId,
} from '../../../helpers/transaction-modal.js'

const origin = process.env.PORTAL_APP_URL ?? 'http://localhost:3001'
const abi = parseAbi([
  'function getStatus(uint256 id) view returns (uint8)',
  'function getSubregistry(string label) view returns (address)',
])
const status = (registry: Address, label: string) =>
  publicClient.readContract({
    address: registry,
    abi,
    functionName: 'getStatus',
    args: [BigInt(labelhash(label))],
  })
const owner = (name: string) => getOwner(publicClient, { name })

test.describe.configure({ timeout: 300_000 })
test.beforeEach(async ({ portalPage: page, wallet }) => {
  test.skip(!isRealBigname, 'Native 4LD witnesses require real bigname')
  await connectWithHeadlessWallet(page, wallet)
})

test('creates a native 4LD in its immediate parent registry', {
  tag: ['@scenario:Q50', '@inv:INV5-native-4ld-writes'],
}, async ({ portalPage: page, wallet, wallets }) => {
  const tree = await makeV2FourLD(wallets.account('owner'))
  const label = 'created'
  const name = `${label}.${tree.parent.name}`
  expect(await status(tree.leaf.registryAddress, label)).toBe(0)
  await page.goto(`${origin}/${tree.parent.name}/create-subname`)
  await page.locator('#label').fill(label)
  await page.locator('#owner').fill(wallets.address('manager'))
  await page.getByRole('button', { name: 'Create subname' }).click()
  await driveTransactionsToSuccess(page, wallet, ['tx-create-ens-subname'])
  expect(await status(tree.leaf.registryAddress, label)).toBe(2)
  expect(await status(tree.parent.registryAddress, label)).toBe(0)
  expect(await owner(name)).toBe(wallets.address('manager'))
  await waitForBignameName(name)
  await page.goto(`${origin}/${tree.parent.name}/subnames`)
  await expect(
    page.locator('table').getByText(name, { exact: true }),
  ).toBeVisible()
})

test('deletes only the native 4LD token', {
  tag: ['@scenario:Q51', '@inv:INV5-native-4ld-writes'],
}, async ({ portalPage: page, wallet, wallets }) => {
  const tree = await makeV2FourLD(wallets.account('owner'))
  expect(await status(tree.leaf.registryAddress, tree.leaf.label)).toBe(2)
  await page.goto(`${origin}/${tree.parent.name}/subnames`)
  await page
    .locator('table')
    .getByRole('button', { name: `Delete ${tree.name}` })
    .click()
  await page
    .locator('table')
    .getByRole('button', { name: 'Confirm', exact: true })
    .click()
  await driveTransactionsToSuccess(page, wallet, [
    `tx-delete-ens-subname-${tree.name}`,
  ])
  expect(await status(tree.leaf.registryAddress, tree.leaf.label)).toBe(0)
  expect(await owner(tree.parent.name)).toBe(wallets.address('owner'))
  expect(await owner(tree.root)).toBe(wallets.address('owner'))
  expect(
    await publicClient.readContract({
      address: ETH_REGISTRY,
      abi,
      functionName: 'getSubregistry',
      args: [tree.root.split('.')[0]],
    }),
  ).toBe(tree.parent.registryAddress)

  expect(
    await publicClient.readContract({
      address: tree.parent.registryAddress,
      abi,
      functionName: 'getSubregistry',
      args: [tree.parent.label],
    }),
  ).toBe(tree.leaf.registryAddress)
})

test('transfers a native 4LD without moving ancestors or detaching records', {
  tag: ['@scenario:Q52', '@inv:INV5-native-4ld-writes'],
}, async ({ portalPage: page, wallet, wallets }) => {
  const tree = await makeV2FourLD(wallets.account('owner'))
  await page.goto(`${origin}/${tree.name}/ownership/transfer`)
  await page
    .getByPlaceholder('ENS name or address')
    .fill(wallets.address('manager'))
  await page.locator('#transfer-option-detachResolver').uncheck()
  await page.getByRole('switch', { name: /Set the ETH address/ }).uncheck()
  await page.getByRole('button', { name: 'Transfer name', exact: true }).click()
  await driveTransactionsToSuccess(page, wallet, [
    transferTxId(tree.name, 'transfer-token-unsafe'),
  ])
  expect(await owner(tree.name)).toBe(wallets.address('manager'))
  expect(await owner(tree.parent.name)).toBe(wallets.address('owner'))
  expect(await owner(tree.root)).toBe(wallets.address('owner'))
  expect(
    await publicClient.readContract({
      address: ETH_REGISTRY,
      abi,
      functionName: 'getSubregistry',
      args: [tree.root.split('.')[0]],
    }),
  ).toBe(tree.parent.registryAddress)

  expect(
    await publicClient.readContract({
      address: tree.parent.registryAddress,
      abi,
      functionName: 'getSubregistry',
      args: [tree.parent.label],
    }),
  ).toBe(tree.leaf.registryAddress)
  await expectRecordsResolve(tree.name, tree.records)
})

test('stranger cannot transfer a native 4LD', {
  tag: ['@scenario:Q53'],
}, async ({ portalPage: page, wallets }) => {
  const tree = await makeV2FourLD(wallets.account('owner'))
  await wallets.switchTo('stranger')
  await page.goto(`${origin}/${tree.name}/ownership/transfer`)
  await expect(
    page.getByRole('heading', { name: 'Not authorized', exact: true }),
  ).toBeVisible()
  await expect(page.getByPlaceholder('ENS name or address')).toHaveCount(0)
  expect(
    await accountHasRoles(tree.leaf, wallets.address('stranger'), [
      'ROLE_CAN_TRANSFER_ADMIN',
    ]),
  ).toBe(false)
  expect(await owner(tree.name)).toBe(wallets.address('owner'))
})

test('edits native 4LD records without changing ancestor records', {
  tag: ['@scenario:Q54', '@inv:INV5-native-4ld-writes'],
}, async ({ portalPage: page, wallet, wallets }) => {
  const tree = await makeV2FourLD(wallets.account('owner'))
  const before = await getTextRecord(publicClient, {
    name: tree.root,
    key: 'description',
  })
  const parentBefore = await getTextRecord(publicClient, {
    name: tree.parent.name,
    key: 'description',
  })
  await page.goto(`${origin}/${tree.name}/edit-records`)
  await page.getByLabel('Type', { exact: true }).selectOption('text')
  await page.getByLabel('Key', { exact: true }).fill('description')
  await page
    .getByLabel('Value', { exact: true })
    .fill('edited native fourth level')
  await page.getByRole('button', { name: 'Add record' }).click()
  await page.getByRole('button', { name: 'Save 1 change', exact: true }).click()
  await driveTransactionsToSuccess(page, wallet, ['tx-save-resolver-records'])
  await expectRecordsResolve(tree.name, {
    texts: [{ key: 'description', value: 'edited native fourth level' }],
  })
  expect(
    await getTextRecord(publicClient, { name: tree.root, key: 'description' }),
  ).toBe(before)
  expect(
    await getTextRecord(publicClient, {
      name: tree.parent.name,
      key: 'description',
    }),
  ).toBe(parentBefore)
})

test('stranger cannot edit native 4LD records', {
  tag: ['@scenario:Q55'],
}, async ({ portalPage: page, wallets }) => {
  const tree = await makeV2FourLD(wallets.account('owner'))
  await wallets.switchTo('stranger')
  await page.goto(`${origin}/${tree.name}/edit-records`)
  await expect(
    page.getByText(/don't have permission to edit records/i),
  ).toBeVisible()
  await expect(page.getByRole('button', { name: 'Add record' })).toHaveCount(0)
  await expectRecordsResolve(tree.name, tree.records)
})

test('native 4LD owner can open name role management', {
  tag: ['@scenario:Q56'],
}, async ({ portalPage: page, wallets }) => {
  const tree = await makeV2FourLD(wallets.account('owner'))
  expect(
    await accountHasRoles(tree.leaf, wallets.address('owner'), [
      'ROLE_SET_RESOLVER_ADMIN',
    ]),
  ).toBe(true)
  await page.goto(`${origin}/${tree.name}/roles`)
  test.fail(true, 'E2E-042: name roles route rejects native V2 4LDs')
  await expect(page.getByRole('heading', { name: / Roles$/ })).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Add user', exact: true }),
  ).toBeEnabled()
  await expect(
    page.getByText('Only 2LD and 3LD .eth names are supported', {
      exact: true,
    }),
  ).toHaveCount(0)
})
