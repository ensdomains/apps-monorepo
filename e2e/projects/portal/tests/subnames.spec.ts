/**
 * Portal subnames and registries — plan §5.D.
 *
 * Oracles are on-chain: `getSubregistry` for registry wiring, `getStatus` for
 * whether a subname exists, and the role bitmap for who may create or delete.
 * The tables are the thing under test, so they are never their own evidence.
 *
 * Two things about this surface shape the tests:
 *
 * 1. The create and delete affordances are gated on `ROLE_REGISTRAR` and
 *    `ROLE_UNREGISTER` **at the subregistry's ROOT resource** (label `''`), not
 *    on the parent name's roles — see `routes/$name/subnames.tsx`. A name's
 *    owner is not automatically able to manage names inside its subregistry;
 *    they can because `makeSubname` deploys that registry with them as admin.
 * 2. The subnames list is indexer-backed (`useSubnames` queries Panoptes and
 *    only falls back to chain on error), so every assertion here waits for the
 *    indexer first. See `helpers/indexer-sync.ts` for why that race is silent.
 */

import { parseAbi, zeroAddress } from 'viem'
import {
  connectWithHeadlessWallet,
  expect,
  test,
} from '../../../fixtures/playwright.portal.fixture.js'
import { publicClient } from '../../../helpers/anvil-client.js'
import {
  waitForIndexedBlock,
  waitForIndexedName,
} from '../../../helpers/indexer-sync.js'
import { driveTransactionsToSuccess } from '../../../helpers/transaction-modal.js'

const PORTAL_APP_URL = process.env.PORTAL_APP_URL ?? 'http://localhost:3001'

/** `routes/$name/create-subname.tsx` / `routes/$name/subnames.tsx`. */
const CREATE_SUBNAME_TX = 'tx-create-ens-subname'
const deleteSubnameTx = (subname: string) => `tx-delete-ens-subname-${subname}`

/**
 * The desktop subnames table. `SubnamesTable` renders the same rows twice —
 * a `md:hidden` card stack for mobile and a real `<table>` for desktop — so
 * any unscoped row locator matches two elements and trips strict mode.
 */
const subnamesTable = (page: import('@playwright/test').Page) =>
  page.locator('table')

const REGISTRY_ABI = parseAbi([
  'function getSubregistry(string label) view returns (address)',
  'function getStatus(uint256 anyId) view returns (uint8)',
])

/** `PermissionedRegistry.getStatus` — 0 available, 1 reserved, 2 registered. */
const REGISTERED = 2

async function subnameStatus(registryAddress: `0x${string}`, label: string) {
  const { keccak256, toHex } = await import('viem')
  return publicClient.readContract({
    address: registryAddress,
    abi: REGISTRY_ABI,
    functionName: 'getStatus',
    args: [BigInt(keccak256(toHex(label)))],
  })
}

test.describe('Portal subnames', () => {
  test.describe.configure({ timeout: 300_000 })

  test('creates a 3LD in the parent registry', {
    tag: ['@scenario:D2'],
  }, async ({ portalPage: page, wallet, makeName, makeSubname, wallets }) => {
    await connectWithHeadlessWallet(page, wallet)

    const parent = await makeName({ label: 'sub-d2', owner: 'user' })
    // One throwaway level, purely to get the parent a subregistry — the
    // subname under test is created through the UI below.
    const { levels } = await makeSubname({
      parent,
      levels: [{ label: 'seed' }],
    })
    const registryAddress = levels[0].registryAddress
    const label = `made-${Date.now().toString(36)}`

    expect(
      await subnameStatus(registryAddress, label),
      'label must not exist before the UI creates it',
    ).not.toBe(REGISTERED)

    await waitForIndexedBlock()
    await page.goto(`${PORTAL_APP_URL}/${parent}/create-subname`)
    await page.locator('#label').fill(label)
    await page.locator('#owner').fill(wallets.address('owner'))
    await page.getByRole('button', { name: 'Create subname' }).click()

    await driveTransactionsToSuccess(page, wallet, [CREATE_SUBNAME_TX])

    expect(
      await subnameStatus(registryAddress, label),
      `${label}.${parent} should be REGISTERED in ${registryAddress}`,
    ).toBe(REGISTERED)

    await waitForIndexedName(`${label}.${parent}`, 180_000)
    await page.goto(`${PORTAL_APP_URL}/${parent}/subnames`)
    await expect(
      subnamesTable(page).getByText(`${label}.${parent}`, { exact: true }),
    ).toBeVisible({ timeout: 30_000 })
  })

  test('creates a 4LD under a 3LD that owns its own registry', {
    tag: ['@scenario:D3'],
  }, async ({ portalPage: page, wallet, makeName, makeSubname, wallets }) => {
    await connectWithHeadlessWallet(page, wallet)

    const parent = await makeName({ label: 'sub-d3', owner: 'user' })
    // `mid` gets its own registry, which is what makes a 4LD possible at all.
    const { levels } = await makeSubname({
      parent,
      levels: [{ label: 'mid', withSubregistry: true }],
    })
    const mid = levels[0]
    expect(
      mid.subregistryAddress,
      'the 3LD must own a registry for a 4LD to live in',
    ).toBeTruthy()

    const label = `leaf-${Date.now().toString(36)}`
    await waitForIndexedBlock()
    await page.goto(`${PORTAL_APP_URL}/${mid.name}/create-subname`)
    await page.locator('#label').fill(label)
    await page.locator('#owner').fill(wallets.address('owner'))
    await page.getByRole('button', { name: 'Create subname' }).click()

    await driveTransactionsToSuccess(page, wallet, [CREATE_SUBNAME_TX])

    // Resolution is only correct if the 4LD landed in the *3LD's* registry,
    // not the parent's — that nesting is the whole point of D3.
    expect(
      await subnameStatus(mid.subregistryAddress as `0x${string}`, label),
      `${label}.${mid.name} should be REGISTERED in the 3LD's own registry`,
    ).toBe(REGISTERED)
  })

  test('does not offer subname creation without ROLE_REGISTRAR', {
    tag: ['@scenario:D4'],
  }, async ({ portalPage: page, wallet, makeName, makeSubname, wallets }) => {
    await connectWithHeadlessWallet(page, wallet)

    const parent = await makeName({ label: 'sub-d4', owner: 'user' })
    await makeSubname({ parent, levels: [{ label: 'seed' }] })

    // The stranger holds nothing on the subregistry's root resource, which
    // is what the create affordance is gated on.
    await waitForIndexedBlock()
    await wallets.switchTo('stranger')
    await page.goto(`${PORTAL_APP_URL}/${parent}/subnames`)

    await expect(
      page.getByRole('link', { name: 'Create subname' }),
      'a wallet without ROLE_REGISTRAR must not be offered subname creation',
    ).toHaveCount(0, { timeout: 30_000 })
  })

  test('deletes a subname', { tag: ['@scenario:D5'] }, async ({
    portalPage: page,
    wallet,
    makeName,
    makeSubname,
  }) => {
    await connectWithHeadlessWallet(page, wallet)

    const parent = await makeName({ label: 'sub-d5', owner: 'user' })
    const { levels } = await makeSubname({
      parent,
      levels: [{ label: 'doomed' }],
    })
    const target = levels[0]
    expect(await subnameStatus(target.registryAddress, 'doomed')).toBe(
      REGISTERED,
    )

    await waitForIndexedName(target.name)
    await page.goto(`${PORTAL_APP_URL}/${parent}/subnames`)
    await subnamesTable(page)
      .getByRole('button', { name: `Delete ${target.name}` })
      .click({ timeout: 30_000 })
    // The trash icon only arms an inline confirm on the row; the transaction
    // modal opens on "Confirm" (SubnamesTable.tsx `pendingDeleteName`).
    await subnamesTable(page)
      .getByRole('button', { name: 'Confirm' })
      .click({ timeout: 15_000 })

    await driveTransactionsToSuccess(page, wallet, [
      deleteSubnameTx(target.name),
    ])

    expect(
      await subnameStatus(target.registryAddress, 'doomed'),
      'unregister should clear the name on-chain, not just hide the row',
    ).not.toBe(REGISTERED)
  })

  test('does not offer deletion without ROLE_UNREGISTER', {
    tag: ['@scenario:D6'],
  }, async ({ portalPage: page, wallet, makeName, makeSubname, wallets }) => {
    await connectWithHeadlessWallet(page, wallet)

    const parent = await makeName({ label: 'sub-d6', owner: 'user' })
    const { levels } = await makeSubname({
      parent,
      levels: [{ label: 'keepme' }],
    })

    await waitForIndexedName(levels[0].name)
    await wallets.switchTo('stranger')
    await page.goto(`${PORTAL_APP_URL}/${parent}/subnames`)

    // The row itself stays visible — subnames are public. Only the delete
    // action must be gone.
    await expect(
      subnamesTable(page).getByText(levels[0].name, { exact: true }),
    ).toBeVisible({ timeout: 30_000 })
    await expect(
      page.getByRole('button', { name: `Delete ${levels[0].name}` }),
      'a wallet without ROLE_UNREGISTER must not be offered deletion',
    ).toHaveCount(0)
  })
})

test.describe('Portal registry', () => {
  test.describe.configure({ timeout: 300_000 })

  test('offers subregistry deployment for a name that has none', {
    tag: ['@scenario:D1'],
  }, async ({ portalPage: page, wallet, makeName }) => {
    await connectWithHeadlessWallet(page, wallet)

    const name = await makeName({ label: 'sub-d1', owner: 'user' })
    const label = name.replace(/\.eth$/, '')
    const ethRegistry = (await import('../../../helpers/role-assertions.js'))
      .ETH_REGISTRY

    expect(
      await publicClient.readContract({
        address: ethRegistry,
        abi: REGISTRY_ABI,
        functionName: 'getSubregistry',
        args: [label],
      }),
      'a freshly registered 2LD has no subregistry',
    ).toBe(zeroAddress)

    await waitForIndexedBlock()
    await page.goto(`${PORTAL_APP_URL}/${name}/subnames`)

    // The owner holds ROLE_SET_SUBREGISTRY, so they are offered the deploy
    // route rather than the "you do not have permission" copy.
    await expect(page.getByText('No subregistry')).toBeVisible({
      timeout: 30_000,
    })
    await expect(
      page.getByRole('link', { name: 'Deploy subregistry' }),
    ).toBeVisible()
  })
})
