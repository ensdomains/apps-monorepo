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

import { getOwner } from '@ensdomains/ensjs/public/v2'
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
import { grantNameRoles } from '../../../helpers/role-assertions.js'
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

  test('subnames registered under a shared registry attribute to the wrong parent name (E2E-007)', {
    tag: ['@scenario:D9'],
  }, async ({ portalPage: page, wallet, makeName, makeSubname, wallets }) => {
    // Repro for a Slack report: koala.eth deploys a registry and registers
    // `blue`/`grey`; kangaroo.eth then links to that SAME registry via
    // "use a pre-existing registry contract" and registers its own
    // `eastern`/`western`. When koala.eth — the original deployer — later
    // registers ANOTHER subname from its own /subnames page, the indexer
    // attributes it to kangaroo.eth instead, because it tracks a single
    // mutable registry -> parent-name pointer rather than per-registration
    // provenance (see SubregistryConfigurator.tsx's `setSubregistry` call,
    // which has no uniqueness check against a registry already in use).
    test.fail()

    await connectWithHeadlessWallet(page, wallet)

    const suffix = Date.now().toString(36)
    const koala = await makeName({ label: `koala-${suffix}`, owner: 'user' })
    const kangaroo = await makeName({
      label: `kangaroo-${suffix}`,
      owner: 'user',
    })

    // koala.eth deploys its own registry and registers a first subname in it.
    const { levels } = await makeSubname({
      parent: koala,
      levels: [{ label: 'blue' }],
    })
    const sharedRegistry = levels[0].registryAddress

    // kangaroo.eth links to koala's already-deployed registry through the
    // portal's own "use a pre-existing registry contract" flow.
    await waitForIndexedBlock()
    await page.goto(`${PORTAL_APP_URL}/${kangaroo}/registry`)
    await page
      .getByRole('button', { name: 'Configure registry' })
      .click({ timeout: 30_000 })
    await page.locator('#registry-option-use-existing').click()
    await page.locator('#contract-address').fill(sharedRegistry)
    await page.getByRole('button', { name: 'Deploy' }).click()
    await driveTransactionsToSuccess(page, wallet, ['tx-set-subregistry'])

    // kangaroo.eth creates its own subname in the now-shared registry.
    await waitForIndexedBlock()
    await page.goto(`${PORTAL_APP_URL}/${kangaroo}/create-subname`)
    await page.locator('#label').fill('eastern')
    await page.locator('#owner').fill(wallets.address('owner'))
    await page.getByRole('button', { name: 'Create subname' }).click()
    await driveTransactionsToSuccess(page, wallet, [CREATE_SUBNAME_TX])
    await waitForIndexedName(`eastern.${kangaroo}`)

    // koala.eth — the ORIGINAL registry owner — registers another subname
    // from its OWN /subnames page, after kangaroo.eth has linked in.
    await page.goto(`${PORTAL_APP_URL}/${koala}/create-subname`)
    await page.locator('#label').fill('purple')
    await page.locator('#owner').fill(wallets.address('owner'))
    await page.getByRole('button', { name: 'Create subname' }).click()
    await driveTransactionsToSuccess(page, wallet, [CREATE_SUBNAME_TX])

    expect(
      await subnameStatus(sharedRegistry, 'purple'),
      `purple.${koala} should be REGISTERED in ${sharedRegistry}`,
    ).toBe(REGISTERED)

    // The indexer never creates an entity under the literal string
    // "purple.<koala>" at all — it names the child using whichever parent
    // currently "owns" the shared registry, i.e. kangaroo. Waiting on that
    // name (rather than the one actually registered from) is what makes this
    // wait deterministic instead of a 60s timeout.
    await waitForIndexedName(`purple.${kangaroo}`)

    // Mirror evidence, both assertions expected to PASS on their own —
    // deliberately not part of the test.fail() below:
    // 1. koala.eth's page still correctly shows the subname it legitimately
    //    registered before kangaroo.eth ever linked in.
    await page.goto(`${PORTAL_APP_URL}/${koala}/subnames`)
    await expect(
      subnamesTable(page).getByText(`blue.${koala}`, { exact: true }),
      `blue.${koala} predates the registry being shared and must still show`,
    ).toBeVisible({ timeout: 30_000 })
    // 2. kangaroo.eth's page shows BOTH its own subname AND the one koala.eth
    //    registered from koala.eth's own page — the flip side of the bug.
    await page.goto(`${PORTAL_APP_URL}/${kangaroo}/subnames`)
    await expect(
      subnamesTable(page).getByText(`eastern.${kangaroo}`, { exact: true }),
      `eastern.${kangaroo} is kangaroo.eth's own subname and must show`,
    ).toBeVisible({ timeout: 30_000 })
    await expect(
      subnamesTable(page).getByText(`purple.${kangaroo}`, { exact: true }),
      `kangaroo.eth incorrectly gains "purple", which was registered from ${koala}'s own /create-subname page`,
    ).toBeVisible({ timeout: 30_000 })

    // Oracle (this is the one expected to fail): a subname registered from
    // koala.eth's own /subnames page must appear on koala.eth's /subnames
    // page — not on kangaroo.eth's, just because kangaroo.eth also points at
    // the same registry contract.
    await page.goto(`${PORTAL_APP_URL}/${koala}/subnames`)
    await expect(
      subnamesTable(page).getByText(`purple.${koala}`, { exact: true }),
      `purple.${koala} was created from ${koala}'s own /subnames page and must appear there, not under ${kangaroo}`,
    ).toBeVisible({ timeout: 30_000 })
  })

  test('subnames registered under a shared registry attribute to the wrong parent name, with separate owners (E2E-007)', {
    tag: ['@scenario:D9'],
  }, async ({ portalPage: page, wallet, makeName, makeSubname, wallets }) => {
    // Same defect as the previous test, but matching the Slack report's
    // primary scenario more closely: koala.eth and kangaroo.eth are owned by
    // two DIFFERENT wallets, not one. Linking to an already-in-use registry
    // grants no roles there, so kangaroo.eth's owner cannot create a subname
    // in it until koala.eth's owner explicitly grants ROLE_REGISTRAR — the
    // "its address is then granted all manager registry roles" step from the
    // report. Once that's done, the misattribution still happens the same
    // way as the single-owner case.
    test.fail()

    await connectWithHeadlessWallet(page, wallet)

    const suffix = Date.now().toString(36)
    // koala.eth is owned by 'user' (the 'owner' participant, and the wallet
    // that starts out connected). kangaroo.eth is owned by 'user2' (the
    // 'manager' participant) — a genuinely different address.
    const koala = await makeName({ label: `koala-${suffix}`, owner: 'user' })
    const kangaroo = await makeName({
      label: `kangaroo-${suffix}`,
      owner: 'user2',
    })

    // koala.eth's owner deploys its own registry and registers a first
    // subname in it. `makeSubname` always signs as the 'owner' participant,
    // which is exactly who owns koala.eth here.
    const { levels } = await makeSubname({
      parent: koala,
      levels: [{ label: 'blue' }],
    })
    const sharedRegistry = levels[0].registryAddress

    // koala.eth's owner grants kangaroo.eth's owner ROLE_REGISTRAR at the
    // shared registry's root resource — otherwise kangaroo.eth's own
    // /create-subname affordance would not even be offered (D4).
    await grantNameRoles(
      { label: '', registryAddress: sharedRegistry },
      wallets.address('manager'),
      ['ROLE_REGISTRAR'],
      wallets.account('owner'),
    )

    // kangaroo.eth's owner links to koala.eth's already-deployed registry
    // through the portal's own "use a pre-existing registry contract" flow,
    // then registers its own subname in it.
    await wallets.switchTo('manager')
    await waitForIndexedBlock()
    await page.goto(`${PORTAL_APP_URL}/${kangaroo}/registry`)
    await page
      .getByRole('button', { name: 'Configure registry' })
      .click({ timeout: 30_000 })
    await page.locator('#registry-option-use-existing').click()
    await page.locator('#contract-address').fill(sharedRegistry)
    await page.getByRole('button', { name: 'Deploy' }).click()
    await driveTransactionsToSuccess(page, wallet, ['tx-set-subregistry'])

    await waitForIndexedBlock()
    await page.goto(`${PORTAL_APP_URL}/${kangaroo}/create-subname`)
    await page.locator('#label').fill('eastern')
    await page.locator('#owner').fill(wallets.address('manager'))
    await page.getByRole('button', { name: 'Create subname' }).click()
    await driveTransactionsToSuccess(page, wallet, [CREATE_SUBNAME_TX])
    await waitForIndexedName(`eastern.${kangaroo}`)

    // koala.eth's owner — the ORIGINAL registry owner — registers another
    // subname from its OWN /subnames page, after kangaroo.eth has linked in.
    await wallets.switchTo('owner')
    await page.goto(`${PORTAL_APP_URL}/${koala}/create-subname`)
    await page.locator('#label').fill('purple')
    await page.locator('#owner').fill(wallets.address('owner'))
    await page.getByRole('button', { name: 'Create subname' }).click()
    await driveTransactionsToSuccess(page, wallet, [CREATE_SUBNAME_TX])

    expect(
      await subnameStatus(sharedRegistry, 'purple'),
      `purple.${koala} should be REGISTERED in ${sharedRegistry}`,
    ).toBe(REGISTERED)

    // As in the same-owner test, the indexer names the child after whichever
    // parent currently owns the shared registry — kangaroo, not koala.
    await waitForIndexedName(`purple.${kangaroo}`)

    // Mirror evidence (expected to PASS): koala.eth still correctly shows its
    // own pre-existing subname, and kangaroo.eth incorrectly gains "purple"
    // in addition to its own "eastern".
    await page.goto(`${PORTAL_APP_URL}/${koala}/subnames`)
    await expect(
      subnamesTable(page).getByText(`blue.${koala}`, { exact: true }),
      `blue.${koala} predates the registry being shared and must still show`,
    ).toBeVisible({ timeout: 30_000 })
    await page.goto(`${PORTAL_APP_URL}/${kangaroo}/subnames`)
    await expect(
      subnamesTable(page).getByText(`eastern.${kangaroo}`, { exact: true }),
      `eastern.${kangaroo} is kangaroo.eth's own subname and must show`,
    ).toBeVisible({ timeout: 30_000 })
    await expect(
      subnamesTable(page).getByText(`purple.${kangaroo}`, { exact: true }),
      `kangaroo.eth incorrectly gains "purple", which was registered from ${koala}'s own /create-subname page`,
    ).toBeVisible({ timeout: 30_000 })

    // Oracle (expected to fail): a subname registered from koala.eth's own
    // /subnames page must appear on koala.eth's /subnames page — not on
    // kangaroo.eth's, even though the two names are owned by different
    // wallets.
    await page.goto(`${PORTAL_APP_URL}/${koala}/subnames`)
    await expect(
      subnamesTable(page).getByText(`purple.${koala}`, { exact: true }),
      `purple.${koala} was created from ${koala}'s own /subnames page and must appear there, not under ${kangaroo}`,
    ).toBeVisible({ timeout: 30_000 })
  })
})

test.describe('Portal registry — protocol invariants (shared registries)', () => {
  test.describe.configure({ timeout: 300_000 })

  test('a shared registry resolves every label identically under every linked parent name, on-chain — by protocol design, not a bug', {
    tag: ['@scenario:D9'],
  }, async ({ portalPage: page, wallet, makeName, makeSubname, wallets }) => {
    // Follow-up to E2E-007/E2E-008: once abc.eth and def.eth share a
    // registry, is it even valid for "1.def" to resolve — given "1" was
    // registered through abc.eth's own page — or is that itself a bug?
    //
    // Answer, proven here on-chain (ensjs `getOwner`, exactly what the app
    // uses — no UI, no indexer): YES, fully valid, by protocol design. A
    // `PermissionedRegistry` stores owner / resolver / subregistry / expiry
    // per LABEL (via its canonical id) with no notion of "which parent name I
    // belong to" anywhere in its state. Once two 2LDs both point their
    // subregistry slot at the same registry contract, EVERY label in it is
    // equally, correctly resolvable through EITHER parent's namespace —
    // regardless of which parent's UI registered it, and regardless of
    // registration order relative to the sharing. There is no "real" parent
    // at the contract level; both are simultaneously, symmetrically correct.
    // E2E-007's defect is that the INDEXER instead behaves as if there is
    // exactly one true parent, and silently picks the wrong one.
    await connectWithHeadlessWallet(page, wallet)

    const suffix = Date.now().toString(36)
    const abc = await makeName({ label: `abc-${suffix}`, owner: 'user' })
    const def = await makeName({ label: `def-${suffix}`, owner: 'user' })

    // abc deploys its own registry and registers "1" before def ever links.
    const { levels } = await makeSubname({
      parent: abc,
      levels: [{ label: '1' }],
    })
    const sharedRegistry = levels[0].registryAddress

    // def links to abc's already-deployed registry through the portal's own
    // "use a pre-existing registry contract" flow.
    await waitForIndexedBlock()
    await page.goto(`${PORTAL_APP_URL}/${def}/registry`)
    await page
      .getByRole('button', { name: 'Configure registry' })
      .click({ timeout: 30_000 })
    await page.locator('#registry-option-use-existing').click()
    await page.locator('#contract-address').fill(sharedRegistry)
    await page.getByRole('button', { name: 'Deploy' }).click()
    await driveTransactionsToSuccess(page, wallet, ['tx-set-subregistry'])

    const chainOwner = async (name: string) =>
      (
        (await getOwner(publicClient as never, { name } as never)) as
          | string
          | null
          | undefined
      )?.toLowerCase()

    // Case 1: "1" predates the sharing, registered from abc's page. def.eth
    // has done nothing except link the registry — it never touched "1" —
    // yet "1.def" resolves, on-chain, to the exact same owner.
    const owner1abc = await chainOwner(`1.${abc}`)
    const owner1def = await chainOwner(`1.${def}`)
    expect(owner1abc, '"1.abc" must resolve to a real owner').toBeTruthy()
    expect(
      owner1def,
      '"1.def" must resolve to the SAME owner as "1.abc" — same registry, same label, same token; the registry has no concept of "which parent"',
    ).toBe(owner1abc)

    // Case 2: abc registers "2" from its OWN /create-subname page, AFTER def
    // has already linked in.
    await waitForIndexedBlock()
    await page.goto(`${PORTAL_APP_URL}/${abc}/create-subname`)
    await page.locator('#label').fill('2')
    await page.locator('#owner').fill(wallets.address('owner'))
    await page.getByRole('button', { name: 'Create subname' }).click()
    await driveTransactionsToSuccess(page, wallet, [CREATE_SUBNAME_TX])

    const owner2abc = await chainOwner(`2.${abc}`)
    const owner2def = await chainOwner(`2.${def}`)
    expect(
      owner2def,
      '"2" was registered from abc\'s own page — "2.def" must still resolve to the same owner as "2.abc"',
    ).toBe(owner2abc)

    // Case 3: def registers "3" from ITS OWN /create-subname page — the
    // mirror image of case 2.
    await page.goto(`${PORTAL_APP_URL}/${def}/create-subname`)
    await page.locator('#label').fill('3')
    await page.locator('#owner').fill(wallets.address('owner'))
    await page.getByRole('button', { name: 'Create subname' }).click()
    await driveTransactionsToSuccess(page, wallet, [CREATE_SUBNAME_TX])

    const owner3def = await chainOwner(`3.${def}`)
    const owner3abc = await chainOwner(`3.${abc}`)
    expect(
      owner3abc,
      '"3" was registered from def\'s own page — "3.abc" must still resolve to the same owner as "3.def"',
    ).toBe(owner3def)

    // Records do NOT follow this symmetry, even though ownership does: a
    // resolver's text/addr storage is keyed by NODE (namehash of the FULL
    // dotted name), which differs between "1.abc" and "1.def" even when both
    // share the same resolver CONTRACT (resolver assignment, like ownership,
    // is per-label registry state — also symmetric). E2E-008 (records.spec.ts)
    // proves the resolver's own on-chain storage stays correctly isolated per
    // node; it is only the indexer's `resolver.texts` field that incorrectly
    // conflates two different nodes' keys, not the resolver contract itself.
  })
})
