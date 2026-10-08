/**
 * Portal name roles — plan §5.C.
 *
 * The oracle for every case here is the on-chain role bitmap read through
 * `helpers/role-assertions.ts`, never the table's own rendering. The table is
 * the thing under test; asserting it against itself would prove nothing.
 *
 * Two facts about the current deployment shape these tests, both measured
 * rather than assumed (see plan §3.3):
 *
 * 1. A freshly registered 2LD owner holds only `ROLE_SET_RESOLVER(+_ADMIN)`,
 *    `ROLE_SET_SUBREGISTRY(+_ADMIN)` and `ROLE_CAN_TRANSFER_ADMIN`. It does
 *    **not** hold `ROLE_RENEW` or `ROLE_UNREGISTER`.
 * 2. The UI can only grant manager-level roles the caller holds the matching
 *    `_ADMIN` for, and `lib/roles/permissions.ts` additionally disables
 *    `ROLE_RENEW` always and `ROLE_UNREGISTER` for 2LDs. So on a 2LD exactly
 *    two roles are grantable through the sheet: Set Resolver and
 *    Set Subregistry — which is precisely the pair the owner has admin over.
 */

import { ensL1Contracts, supportedL1Chains } from '@ensdomains/ensjs/chain'
import { getName } from '@ensdomains/ensjs/public'
import { getOwner } from '@ensdomains/ensjs/public/v2'
import { labelToCanonicalId } from '@ensdomains/ensjs/utils/v2'
import {
  grantRolesWriteParameters,
  revokeRolesWriteParameters,
} from '@ensdomains/ensjs/wallet/v2'
import { permissionedRegistryGetStateSnippet } from '@ensdomains/ensjs-abi/v2/permissionedRegistry'
import type { Web3ProviderBackend } from '@ensdomains/headless-web3-provider'
import type { Page } from '@playwright/test'
import {
  type Account,
  type Address,
  encodeFunctionData,
  type Hash,
  type Hex,
  keccak256,
  labelhash,
  parseAbi,
  parseAbiItem,
  toHex,
  zeroAddress,
} from 'viem'
import { generatePrivateKey, privateKeyToAddress } from 'viem/accounts'
import { attachSubregistry } from '../../../fixtures/makeSubname.js'
import { createMakeV1Name } from '../../../fixtures/makeV1Name.js'
import {
  connectWithHeadlessWallet,
  expect,
  test,
} from '../../../fixtures/playwright.portal.fixture.js'
import { publicClient, walletClient } from '../../../helpers/anvil-client.js'
import {
  waitForIndexedBlock,
  waitForIndexedName,
  waitForIndexedRoles,
} from '../../../helpers/indexer-sync.js'
import { authorizeTransaction } from '../../../helpers/portal-auth.js'
import {
  accountHasRoles,
  assertRoleBitmap,
  ETH_REGISTRY,
  grantNameRoles,
  type Role,
  readNameRoles,
  readRoleHolders,
  revokeNameRoles,
} from '../../../helpers/role-assertions.js'
import {
  driveTransactionsToSuccess,
  PORTAL_TRANSACTION_IDS,
} from '../../../helpers/transaction-modal.js'

const PORTAL_APP_URL = process.env.PORTAL_APP_URL ?? 'http://localhost:3001'

/** `truncateAddress(addr, 6, 4)` — how the roles table renders an account. */
const truncate = (address: string) =>
  `${address.slice(0, 6)}…${address.slice(-4)}`

/**
 * `roleTableColumns.tsx#formatRoleLabel` — `ROLE_SET_RESOLVER_ADMIN` and
 * `ROLE_SET_RESOLVER` both render as the single row "Set Resolver", with the
 * Admin / Manager columns distinguishing them.
 */
const roleLabel = (role: string) =>
  role
    .replace(/^ROLE_/, '')
    .replace(/_ADMIN$/, '')
    .toLowerCase()
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')

/** `PermissionedRegistry.getStatus` — 1 is RESERVED. */
const RESERVED = 1

const readStatus = (label: string) =>
  publicClient.readContract({
    address: ETH_REGISTRY,
    abi: parseAbi(['function getStatus(uint256 anyId) view returns (uint8)']),
    functionName: 'getStatus',
    args: [labelToCanonicalId(label)],
  })

const rolesPage = (name: string) => `${PORTAL_APP_URL}/${name}/roles`

/**
 * The "parent registry / roles" table — the one §5.C is about. The heading
 * gained its slash in #1105 (2026-08-27); this locator kept the old text until
 * 2026-10-08, so every test built on it timed out here.
 *
 * The page renders three role tables (`{name} registry roles`,
 * `{name} resolver roles`, then this one), so it has to be picked by heading.
 * `following::table[1]` rather than a sibling step: the heading lives inside a
 * flex row next to the Add-user button, and the table is a sibling of *that
 * row*, not of the heading — and for an account without an admin role the
 * button is not rendered at all, so sibling arithmetic finds nothing.
 */
const nameRolesSection = (page: import('@playwright/test').Page) =>
  page
    .locator('h3', { hasText: 'parent registry / roles' })
    .locator('xpath=following::table[1]')

/**
 * The roles table is indexer-backed, so it can only be asserted once Panoptes
 * holds the role events for every account the assertion names. Without this
 * the page renders its empty state — or a partial one — and caches it. See
 * `helpers/indexer-sync.ts`.
 */
const awaitIndexed = (label: string, accounts: Address[]) =>
  waitForIndexedRoles(ETH_REGISTRY, labelToCanonicalId(label), accounts)

/**
 * The "parent registry / roles" panel's content root — whichever of
 * `V2NameRoles`'s states (`RolesTable`, or the `NoResultsMessage` empty
 * state) is currently rendered. Unlike {@link nameRolesSection} this does not
 * assume a `<table>` exists — the empty state renders none at all, so
 * `following::table[1]` would silently skip past this panel to whatever
 * table happens to follow it elsewhere in the document. Instead this takes
 * the heading row's very next sibling, matching
 * `NameRolesOverviewTable`'s actual JSX (`[headingRow, V2NameRoles output,
 * RolesAddUserSheet]` — the sheet is a closed Radix portal and contributes no
 * inline sibling node when it isn't open).
 */
const parentRegistryRolesPanel = (page: import('@playwright/test').Page) =>
  page
    .locator('h3', { hasText: 'parent registry / roles' })
    .locator('xpath=parent::div/following-sibling::*[1]')

/**
 * The registry-wide window size `useNameRoleAccounts.ts` used *before*
 * E2E-009 was fixed. No longer an app constant — the app now reads
 * resource-scoped logs — so this is purely the test's own parameter: the
 * number of unrelated events the flood must exceed to recreate the
 * historical failure condition the regression guard asserts against.
 */
const MAX_EVENTS = 1000

/**
 * How long the "parent registry / roles" panel may take to settle.
 *
 * Generous on purpose. Since #1131/#1137 the panel reads role changes from
 * on-chain logs (`getRoleChangeLogs`, `fromBlock: ROLES_FROM_BLOCK`) rather
 * than from the indexer, and against a local Anvil fork that is a scan of
 * ~284k blocks which Anvil serves in small chunks. Measured on this fork:
 * **29.1s** from navigation to the first rendered row — under the 30s that
 * used to be the timeout here by less than a second, which is exactly the
 * shape of a test that passes on one machine and fails on the next.
 *
 * This is a property of the fork, not evidence of a product bug: real Sepolia
 * RPCs answer an indexed-topic `eth_getLogs` over the same range quickly. It
 * is worth re-measuring if the panel ever feels slow in a deployed
 * environment, and worth revisiting here if it grows past this budget — the
 * fork's history only gets longer.
 */
const ROLE_PANEL_TIMEOUT = 120_000

const INDEXER_URL =
  process.env.E2E_INDEXER_GRAPHQL_URL ?? 'http://127.0.0.1:5655/graphql'

type EACRolesChangedPayload = { resource?: string }

/**
 * Newest `first` `EACRolesChanged` events for the whole `.eth` registry, each
 * paired with its block number — the query `useNameRoleAccounts.ts` ran
 * before E2E-009 was fixed, plus `blockNumber` (a separate top-level field,
 * not part of the decoded payload) so callers can reason about *when* the
 * window's contents were written, not just how many there are. Kept as the
 * regression guard's precondition probe, not as a mirror of app code.
 *
 * This registry accumulates events across the whole session (every test that
 * has ever run against this fork, including this file's own C1-C12 grants),
 * so "how many events exist in total" is not a meaningful signal on its own
 * — it is already past `MAX_EVENTS` before this test even starts. What
 * matters is *which* blocks the newest-`first` window currently spans.
 */
async function newestRegistryRoleEvents(
  first: number,
): Promise<(EACRolesChangedPayload & { blockNumber: number })[]> {
  const res = await fetch(INDEXER_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query: `{ events(where: { type: "EACRolesChanged", contractAddress: "${ETH_REGISTRY.toLowerCase()}" },
                first: ${first}, orderBy: "blockNumber", orderDirection: "desc") { data blockNumber } }`,
    }),
  })
  const { data } = (await res.json()) as {
    data?: { events: { data: string; blockNumber: number }[] }
  }
  return (data?.events ?? []).map((event) => ({
    ...(JSON.parse(event.data) as EACRolesChangedPayload),
    blockNumber: event.blockNumber,
  }))
}

/**
 * Whether `resource` appears anywhere in the newest `first` registry-wide
 * events. Absent at `first: MAX_EVENTS` but present once the window is
 * widened proves the indexer *has* the event and only a fixed-size
 * registry-wide window would miss it, rather than there being an indexing
 * gap — which is what makes the flood a valid precondition rather than a
 * silent no-op.
 */
async function indexerHasResourceInWindow(
  resource: bigint,
  first: number,
): Promise<boolean> {
  const wanted = `0x${resource.toString(16).padStart(64, '0')}`.toLowerCase()
  const events = await newestRegistryRoleEvents(first)
  return events.some((event) => event.resource?.toLowerCase() === wanted)
}

/**
 * Blocks until the newest `windowSize` registry-wide events are *entirely*
 * at or after `minBlock` — i.e. every one of them postdates the flood's
 * start, which by construction postdates the target's own grant. This is
 * the real precondition the test needs (a specific number of genuinely
 * newer events landed), not merely "the indexer has indexed `windowSize`
 * events somewhere in its history" — this registry accumulates events for
 * the life of the whole fork, so a raw total is already past `MAX_EVENTS`
 * before this test even starts and proves nothing about freshness.
 *
 * Waits on this rather than a specific block height for the flood's exact
 * last transaction: measured directly against a real Panoptes, its final
 * backfill batch can permanently drop the last handful of blocks in a burst
 * (reproduced even from a fully fresh, cold resync), so a few blocks short of
 * the true tip is normal and a hard block-number barrier can wait forever.
 */
async function waitForWindowPastBlock(
  minBlock: bigint,
  windowSize: number,
  timeoutMs: number,
): Promise<number> {
  const deadline = Date.now() + timeoutMs
  let events: Awaited<ReturnType<typeof newestRegistryRoleEvents>> = []
  while (Date.now() < deadline) {
    events = await newestRegistryRoleEvents(windowSize)
    const oldestInWindow = events.at(-1)
    if (
      events.length >= windowSize &&
      oldestInWindow &&
      BigInt(oldestInWindow.blockNumber) >= minBlock
    ) {
      return events.length
    }
    await new Promise((r) => setTimeout(r, 2_000))
  }
  const oldest = events.at(-1)?.blockNumber
  throw new Error(
    `Panoptes' newest ${windowSize} events for ${ETH_REGISTRY} did not all ` +
      `reach block ${minBlock} within ${timeoutMs}ms (got ${events.length} ` +
      `events, oldest at block ${oldest}).`,
  )
}

/**
 * Emits `count` `EACRolesChanged` events on `ETH_REGISTRY`, all for `label`'s
 * own resource and none touching the resource under test — the mechanism
 * behind E2E-009. Alternates granting and revoking one role to `grantee` so
 * every call actually flips the bitmap (and therefore always emits an
 * event), signed by `signer` — which must hold that role's admin on `label`,
 * true of any fresh 2LD owner.
 *
 * Sent and confirmed one at a time rather than pipelined. Measured directly:
 * firing many transactions at once lets Anvil's automine pack dozens-to-~100
 * of them into a single block, and a real Panoptes silently drops most of a
 * block's matching events once it gets that dense (confirmed on this exact
 * fork — a block with 99 transactions yielded only 4 recorded events, no
 * error surfaced). One-at-a-time keeps each block to a single relevant
 * transaction, which is also the shape real registration traffic actually
 * has (roughly one grant per block, not bursts of hundreds).
 */
async function floodRoleEvents({
  label,
  signer,
  grantee,
  count,
}: {
  label: string
  signer: Account
  grantee: Address
  count: number
}): Promise<Hash> {
  const resource = labelToCanonicalId(label)
  const roles: Role[] = ['ROLE_SET_RESOLVER']

  const grantParams = grantRolesWriteParameters(
    walletClient as never,
    {
      registryAddress: ETH_REGISTRY,
      account: grantee,
      resource,
      roles,
    } as never,
  )
  const revokeParams = revokeRolesWriteParameters(
    walletClient as never,
    {
      registryAddress: ETH_REGISTRY,
      account: grantee,
      resource,
      roles,
    } as never,
  )
  const grantData = encodeFunctionData({
    abi: grantParams.abi,
    functionName: grantParams.functionName,
    args: grantParams.args as never,
  } as never)
  const revokeData = encodeFunctionData({
    abi: revokeParams.abi,
    functionName: revokeParams.functionName,
    args: revokeParams.args as never,
  } as never)

  let lastHash: Hash | undefined
  for (let n = 0; n < count; n++) {
    lastHash = await walletClient.sendTransaction({
      account: signer,
      to: ETH_REGISTRY,
      data: n % 2 === 0 ? grantData : revokeData,
    })
    await publicClient.waitForTransactionReceipt({ hash: lastHash })
  }
  return lastHash!
}

const REGISTRY_WRITE_ABI = parseAbi([
  'function setApprovalForAll(address operator, bool approved)',
  'function setResolver(uint256 anyId, address resolver)',
  'function safeTransferFrom(address from, address to, uint256 id, uint256 amount, bytes data)',
])

/** Send a registry write signed by `signer`. */
async function registryWrite(signer: Account, data: `0x${string}`) {
  const hash = await walletClient.sendTransaction({
    account: signer,
    to: ETH_REGISTRY,
    data,
  })
  return publicClient.waitForTransactionReceipt({ hash })
}

const setApprovalForAll = (
  operator: Address,
  approved: boolean,
  signer: Account,
) =>
  registryWrite(
    signer,
    encodeFunctionData({
      abi: REGISTRY_WRITE_ABI,
      functionName: 'setApprovalForAll',
      args: [operator, approved],
    }),
  )

const transferName = (
  label: string,
  from: Address,
  to: Address,
  signer: Account,
) =>
  registryWrite(
    signer,
    encodeFunctionData({
      abi: REGISTRY_WRITE_ABI,
      functionName: 'safeTransferFrom',
      args: [from, to, labelToCanonicalId(label), 1n, '0x'],
    }),
  )

/**
 * Whether `signer` can actually change the resolver — the behavioural half of
 * the operator-approval oracle. `setResolver` takes the canonical id, not the
 * label; passing a string silently reverts for the wrong reason.
 */
async function canSetResolver(
  label: string,
  signer: Account,
): Promise<boolean> {
  try {
    await registryWrite(
      signer,
      encodeFunctionData({
        abi: REGISTRY_WRITE_ABI,
        functionName: 'setResolver',
        args: [labelToCanonicalId(label), signer.address],
      }),
    )
    return true
  } catch {
    return false
  }
}

test.describe('Portal name roles', () => {
  test.describe.configure({ timeout: 240_000 })

  test('lists every role holder with the roles they actually hold on-chain', {
    tag: ['@scenario:C1'],
  }, async ({ portalPage: page, wallet, makeName, wallets }) => {
    await connectWithHeadlessWallet(page, wallet)

    const owner = wallets.address('owner')
    const manager = wallets.address('manager')
    const name = await makeName({ label: 'roles-c1', owner: 'user' })
    const label = name.replace(/\.eth$/, '')

    // A second holder, so the table has to render more than the owner row.
    await grantNameRoles(
      { label },
      manager,
      ['ROLE_SET_SUBREGISTRY'],
      wallets.account('owner'),
    )

    const onChain = await readRoleHolders({ label })
    const expectedHolders = [...onChain.entries()]
      .filter(([, roles]) => roles.length > 0)
      .map(([account]) => account)
    expect(
      expectedHolders.map((a) => a.toLowerCase()).sort(),
      'chain should show exactly the owner and the granted manager',
    ).toEqual([owner.toLowerCase(), manager.toLowerCase()].sort())

    await awaitIndexed(label, expectedHolders)
    await page.goto(rolesPage(name))
    const table = nameRolesSection(page)
    await expect(table).toBeVisible({ timeout: 30_000 })

    // Every on-chain holder appears, with exactly the permission rows their
    // bitmap implies — the table is only correct if both halves line up.
    for (const account of expectedHolders) {
      const row = table.locator('tr', { hasText: truncate(account) })
      await expect(
        row,
        `${account} holds roles on-chain but has no row in the table`,
      ).toHaveCount(1, { timeout: 20_000 })

      const { decoded } = await readNameRoles({ label }, account)
      const expectedLabels = [...new Set(decoded.map(roleLabel))].sort()
      for (const permission of expectedLabels) {
        await expect(
          row.getByText(permission, { exact: true }),
          `${account}'s row should list "${permission}"`,
        ).toBeVisible()
      }
    }

    // …and nobody else. A table that invents a holder is as wrong as one
    // that drops one.
    await expect(table.locator('tbody tr')).toHaveCount(expectedHolders.length)
  })

  test('grants a single role to a second wallet', {
    tag: ['@scenario:C2', '@smoke'],
  }, async ({ portalPage: page, wallet, makeName, wallets }) => {
    await connectWithHeadlessWallet(page, wallet)

    const manager = wallets.address('manager')
    const name = await makeName({ label: 'roles-c2', owner: 'user' })
    const label = name.replace(/\.eth$/, '')

    await assertRoleBitmap({ label }, manager, [])

    await page.goto(rolesPage(name))
    await page.getByRole('button', { name: 'Add user' }).click()
    await expect(page.getByRole('heading', { name: 'Add user' })).toBeVisible({
      timeout: 20_000,
    })

    await page.getByLabel('User name or address').fill(manager)
    await page.locator('#add-ROLE_SET_RESOLVER-manager').click()
    await page.getByRole('button', { name: 'Save' }).click()

    await driveTransactionsToSuccess(page, wallet, [
      PORTAL_TRANSACTION_IDS.grantRoles,
    ])

    // The oracle is the bitmap, and exactly the bitmap: granting Set
    // Resolver must not quietly bring its admin variant with it.
    await assertRoleBitmap({ label }, manager, ['ROLE_SET_RESOLVER'])
  })

  test('grants several roles in one transaction', {
    tag: ['@scenario:C3'],
  }, async ({ portalPage: page, wallet, makeName, wallets }) => {
    await connectWithHeadlessWallet(page, wallet)

    const manager = wallets.address('manager')
    const name = await makeName({ label: 'roles-c3', owner: 'user' })
    const label = name.replace(/\.eth$/, '')

    await page.goto(rolesPage(name))
    await page.getByRole('button', { name: 'Add user' }).click()
    await page.getByLabel('User name or address').fill(manager)
    await page.locator('#add-ROLE_SET_RESOLVER-manager').click()
    await page.locator('#add-ROLE_SET_SUBREGISTRY-manager').click()
    await page.getByRole('button', { name: 'Save' }).click()

    // One id, therefore one transaction: `buildRoleTransactions` batches
    // both grants into a single call rather than emitting one per role.
    await driveTransactionsToSuccess(page, wallet, [
      PORTAL_TRANSACTION_IDS.grantRoles,
    ])

    await assertRoleBitmap({ label }, manager, [
      'ROLE_SET_RESOLVER',
      'ROLE_SET_SUBREGISTRY',
    ])
  })

  test('revokes a role', { tag: ['@scenario:C4'] }, async ({
    portalPage: page,
    wallet,
    makeName,
    wallets,
  }) => {
    await connectWithHeadlessWallet(page, wallet)

    const manager = wallets.address('manager')
    const name = await makeName({ label: 'roles-c4', owner: 'user' })
    const label = name.replace(/\.eth$/, '')

    // Precondition built on-chain, not through the UI — this test is about
    // revoking, and routing the setup through the grant flow would make a
    // grant regression look like a revoke failure.
    await grantNameRoles(
      { label },
      manager,
      ['ROLE_SET_RESOLVER', 'ROLE_SET_SUBREGISTRY'],
      wallets.account('owner'),
    )
    await assertRoleBitmap({ label }, manager, [
      'ROLE_SET_RESOLVER',
      'ROLE_SET_SUBREGISTRY',
    ])

    await awaitIndexed(label, [manager])
    await page.goto(rolesPage(name))
    const table = nameRolesSection(page)
    const managerRow = table.locator('tr', { hasText: truncate(manager) })
    await expect(managerRow).toHaveCount(1, { timeout: 30_000 })
    await managerRow.getByRole('button', { name: 'Edit user roles' }).click()

    await expect(
      page.getByRole('heading', { name: truncate(manager) }),
    ).toBeVisible({ timeout: 20_000 })
    await page.locator('#ROLE_SET_RESOLVER-manager').click()
    await page.getByRole('button', { name: 'Save' }).click()

    await driveTransactionsToSuccess(page, wallet, [
      PORTAL_TRANSACTION_IDS.revokeRoles,
    ])

    // Only the unchecked role goes; the other one must survive.
    await assertRoleBitmap({ label }, manager, ['ROLE_SET_SUBREGISTRY'])
  })

  test('hides role management from an account that holds no admin role', {
    tag: ['@scenario:C5'],
  }, async ({ portalPage: page, wallet, makeName, wallets }) => {
    await connectWithHeadlessWallet(page, wallet)

    const stranger = wallets.address('stranger')
    const name = await makeName({ label: 'roles-c5', owner: 'user' })
    const label = name.replace(/\.eth$/, '')

    await assertRoleBitmap({ label }, stranger, [])

    await awaitIndexed(label, [wallets.address('owner')])
    await wallets.switchTo('stranger')
    await page.goto(rolesPage(name))

    const table = nameRolesSection(page)
    await expect(table).toBeVisible({ timeout: 30_000 })

    // The table stays readable — roles are public. What must disappear is
    // every affordance that would write.
    await expect(
      page.getByRole('button', { name: 'Add user' }),
      'a non-admin must not be offered "Add user"',
    ).toHaveCount(0)
    await expect(
      table.getByRole('button', { name: 'Edit user roles' }),
      'a non-admin must not be offered the per-row role editor',
    ).toHaveCount(0)
  })

  test('records every grant and revoke in the role history', {
    tag: ['@scenario:C11'],
  }, async ({ portalPage: page, wallet, makeName, wallets }) => {
    await connectWithHeadlessWallet(page, wallet)

    const manager = wallets.address('manager')
    const name = await makeName({ label: 'roles-c11', owner: 'user' })
    const label = name.replace(/\.eth$/, '')

    // Grant two, revoke one. Revoking everything would drop the account from
    // the table entirely (RolesTable filters empty role sets), taking the row
    // that opens the history with it.
    await grantNameRoles(
      { label },
      manager,
      ['ROLE_SET_RESOLVER', 'ROLE_SET_SUBREGISTRY'],
      wallets.account('owner'),
    )
    await revokeNameRoles(
      { label },
      manager,
      ['ROLE_SET_RESOLVER'],
      wallets.account('owner'),
    )
    await assertRoleBitmap({ label }, manager, ['ROLE_SET_SUBREGISTRY'])

    await awaitIndexed(label, [manager])
    await page.goto(rolesPage(name))
    const table = nameRolesSection(page)
    const managerRow = table.locator('tr', { hasText: truncate(manager) })
    await expect(managerRow).toHaveCount(1, { timeout: 30_000 })
    await managerRow.getByRole('button', { name: 'Edit user roles' }).click()

    await expect(page.getByRole('heading', { name: 'History' })).toBeVisible({
      timeout: 20_000,
    })

    // Both transitions must be present as signed diffs — a history that only
    // shows the current state, or drops the revoke, is not a history.
    const history = page.locator('table').last()
    await expect(
      history,
      'the grant of both roles should appear',
    ).toContainText('+ ROLE_SET_SUBREGISTRY', { timeout: 20_000 })
    await expect(
      history,
      'the later revoke should appear as a removal, not as an absence',
    ).toContainText('- ROLE_SET_RESOLVER')
  })

  test('shows no role holders once the name has expired', {
    tag: ['@scenario:C7'],
  }, async ({ portalPage: page, wallet, makeName, wallets }) => {
    await connectWithHeadlessWallet(page, wallet)

    // Measured on the fork: expiry takes the name to AVAILABLE and clears the
    // owner's roles outright — a grant attempted afterwards reverts
    // EACCannotGrantRoles. So there is nothing for the roles table to list.
    const name = await makeName({
      label: 'roles-c7',
      owner: 'user',
      duration: -86_400,
    })
    const label = name.replace(/\.eth$/, '')
    const owner = wallets.address('owner')

    await assertRoleBitmap({ label }, owner, [])

    await page.goto(rolesPage(name))

    // The table is rebuilt by replaying EACRolesChanged events, and expiry
    // emits none — so a table that still lists the former owner is reporting
    // authority that no longer exists on chain.
    await expect(
      nameRolesSection(page).locator('tr', { hasText: truncate(owner) }),
      'an expired name must not still list its former owner as a role holder',
    ).toHaveCount(0, { timeout: 30_000 })
    await expect(
      page.getByRole('button', { name: 'Add user' }),
      'and must not offer role management',
    ).toHaveCount(0)
  })

  test('gives an approved operator the blended role set, and takes it back', {
    tag: ['@scenario:C9'],
  }, async ({ portalPage: page, wallet, makeName, wallets }) => {
    await connectWithHeadlessWallet(page, wallet)

    const operator = wallets.address('manager')
    const name = await makeName({ label: 'roles-c9', owner: 'user' })
    const label = name.replace(/\.eth$/, '')
    const owner = wallets.address('owner')

    await assertRoleBitmap({ label }, operator, [])
    expect(
      await canSetResolver(label, wallets.account('manager')),
      'an unapproved operator must not be able to set the resolver',
    ).toBe(false)

    await setApprovalForAll(operator, true, wallets.account('owner'))

    // Approval is not a stored grant — it is blended in at authorization time,
    // so both halves matter: the reported bitmap AND the ability to act on it.
    const ownerRoles = (await readNameRoles({ label }, owner)).decoded
    await assertRoleBitmap({ label }, operator, ownerRoles)
    expect(
      await canSetResolver(label, wallets.account('manager')),
      'an approved operator should be able to set the resolver',
    ).toBe(true)

    await setApprovalForAll(operator, false, wallets.account('owner'))

    await assertRoleBitmap({ label }, operator, [])
    expect(
      await canSetResolver(label, wallets.account('manager')),
      'revoking approval must take the authority back',
    ).toBe(false)
  })

  test('moves the whole role set to the new owner on transfer', {
    tag: ['@scenario:C12'],
  }, async ({ portalPage: page, wallet, makeName, wallets }) => {
    await connectWithHeadlessWallet(page, wallet)

    const oldOwner = wallets.address('owner')
    const newOwner = wallets.address('manager')
    const name = await makeName({ label: 'roles-c12', owner: 'user' })
    const label = name.replace(/\.eth$/, '')

    const before = (await readNameRoles({ label }, oldOwner)).decoded
    expect(before.length, 'the owner should start with roles').toBeGreaterThan(
      0,
    )
    await assertRoleBitmap({ label }, newOwner, [])

    await transferName(label, oldOwner, newOwner, wallets.account('owner'))

    // The set moves wholesale: the recipient gains exactly what the sender
    // held, and the sender is left with nothing. A transfer that left the old
    // owner any authority would be the dangerous half of this.
    await assertRoleBitmap({ label }, newOwner, before)
    await assertRoleBitmap({ label }, oldOwner, [])

    await awaitIndexed(label, [newOwner])
    await page.goto(rolesPage(name))
    const table = nameRolesSection(page)
    await expect(table).toBeVisible({ timeout: 30_000 })
    await expect(
      table.locator('tr', { hasText: truncate(newOwner) }),
      'the new owner should be listed as a role holder',
    ).toHaveCount(1)
    await expect(
      table.locator('tr', { hasText: truncate(oldOwner) }),
      'the previous owner must no longer be listed',
    ).toHaveCount(0)
  })

  test('shows no role holders for a name that is only reserved', {
    tag: ['@scenario:C8'],
  }, async ({ portalPage: page, wallet, wallets }) => {
    await connectWithHeadlessWallet(page, wallet)

    // A V1 registration reserves the V2 slot with owner = 0 and an empty role
    // bitmap, so there is genuinely nobody to list. Measured: getStatus is
    // RESERVED(1), the V1 owner holds no V2 roles, and a grant against the
    // reserved slot reverts EACCannotGrantRoles.
    const makeV1Name = createMakeV1Name({
      userAccount: wallets.account('owner'),
    })
    const v1Name = await makeV1Name({ label: 'roles-c8' })
    const label = v1Name.replace(/\.eth$/, '')

    expect(
      await readStatus(label),
      'the V1 registration should have reserved the V2 slot',
    ).toBe(RESERVED)
    await assertRoleBitmap({ label }, wallets.address('owner'), [])

    await page.goto(rolesPage(v1Name))

    await expect(
      nameRolesSection(page).locator('tr', {
        hasText: truncate(wallets.address('owner')),
      }),
      'a reserved slot has no owner, so nobody may be listed as a role holder',
    ).toHaveCount(0, { timeout: 30_000 })
    await expect(
      page.getByRole('button', { name: 'Add user' }),
      'and role management must not be offered on a slot nobody owns',
    ).toHaveCount(0)
  })

  /**
   * Regression guard for E2E-009, which is now FIXED (#1131, #1133, #1137).
   *
   * The defect, from a Slack report (Joe/Florin): the "parent registry /
   * roles" panel showed "No role holders yet" for fox.eth even though its
   * owner genuinely held roles on-chain. `useNameRoleAccounts.ts` fetched
   * only the newest `MAX_EVENTS` (1000) `EACRolesChanged` events for the
   * WHOLE `.eth` registry, then filtered to the name's own `resource`
   * client-side. There is one such event per registration/grant, so the
   * window covered only the newest ~3 days of a busy registry — a grant
   * older than that never reached the filter step, and the panel rendered
   * exactly the same empty state as a name that genuinely has no role
   * holders (C7, C8). The on-chain fallback only fired on a hard error, and
   * a successful-but-incomplete response never triggered it.
   *
   * The fix reads role changes from indexed logs scoped to the resource
   * (`lib/roles/roleChangeLogs.ts`), so registry-wide traffic is now
   * irrelevant by construction. This test therefore asserts the OPPOSITE of
   * what it was written to catch: the holder must survive the flood.
   *
   * The flood is kept rather than simplified away, because deleting it would
   * leave nothing standing between this panel and a revert to a
   * registry-wide window. It is also why the two `indexerHasResourceInWindow`
   * checks below are kept — demoted from root-cause evidence to
   * PRECONDITIONS. Without them a broken flood would make this test pass
   * vacuously, which is the exact "passes for the wrong reason" failure this
   * file's other cases are written to avoid.
   *
   * As in every other case in this file, the oracle is the on-chain role
   * bitmap — never the table's own rendering, and never a mocked indexer
   * response. (The portal fixture installs no indexer mock; only the manager
   * fixture does. This runs against real Panoptes.)
   */
  test('keeps listing a role holder after 1000 newer events land on the registry (E2E-009 regression)', {
    tag: ['@scenario:C1'],
  }, async ({ portalPage: page, wallet, makeName, wallets }) => {
    test.setTimeout(900_000)
    await connectWithHeadlessWallet(page, wallet)

    const owner = wallets.address('owner')
    const name = await makeName({ label: 'roles-e2e009', owner: 'user' })
    const label = name.replace(/\.eth$/, '')

    const before = (await readNameRoles({ label }, owner)).decoded
    expect(
      before.length,
      'the owner should hold real roles from registration',
    ).toBeGreaterThan(0)

    // Baseline: before any flood, the panel lists the owner. This rules out
    // the panel being broken outright, so that if the post-flood assertion
    // ever fails it can only be the flood that caused it.
    await awaitIndexed(label, [owner])
    await page.goto(rolesPage(name))
    await expect(
      parentRegistryRolesPanel(page).locator('tr', {
        hasText: truncate(owner),
      }),
      'baseline: the owner should be listed before any flood',
    ).toHaveCount(1, { timeout: ROLE_PANEL_TIMEOUT })

    // Flood the SAME registry with >1000 newer EACRolesChanged events on an
    // unrelated resource — a throwaway name whose owner alternately grants
    // and revokes one role to a third account. Nothing here touches the
    // target name's own resource at all. This registry is shared and
    // accumulates events for the life of the whole fork (every test that
    // has run against it, this file's own C1-C12 included), so the flood's
    // start block — not a count — is what "newer than the target" has to
    // be measured against from here on.
    const floodStartBlock = await publicClient.getBlockNumber()
    const noiseOwner = wallets.account('manager')
    const noiseName = await makeName({
      label: 'roles-e2e009-noise',
      owner: 'user2',
    })
    const noiseLabel = noiseName.replace(/\.eth$/, '')
    const grantee = wallets.address('stranger')

    // Padded well past MAX_EVENTS: a real Panoptes, measured directly, can
    // permanently drop the last handful of blocks of a burst from its
    // final backfill batch (reproduced even from a fully fresh, cold
    // resync) — this margin absorbs that and still leaves the widened-
    // window root-cause check below plenty of headroom.
    const FLOOD_COUNT = MAX_EVENTS + 300
    // Each transaction is sent and confirmed before the next, so this
    // returns only once every flood transaction is already mined.
    await floodRoleEvents({
      label: noiseLabel,
      signer: noiseOwner,
      grantee,
      count: FLOOD_COUNT,
    })

    // Confirm the newest MAX_EVENTS window is now made up *entirely* of
    // events at or after the flood's start before asserting absence —
    // otherwise "no rows" could just mean "not indexed yet", the
    // different, already-documented indexer-lag race
    // (helpers/indexer-sync.ts), not this defect. See
    // {@link waitForWindowPastBlock} for why this, and not a raw event
    // count or a specific block height, is the right precondition.
    await waitForWindowPastBlock(floodStartBlock, MAX_EVENTS, 300_000)

    // Nothing changed on-chain for the target name.
    const after = (await readNameRoles({ label }, owner)).decoded
    expect(
      after,
      'on-chain roles for the target name must be unaffected by the flood',
    ).toEqual(before)

    // PRECONDITION, not an assertion about the app: prove the flood really
    // did recreate the adverse condition. The target resource must now be
    // absent from a newest-1000 registry-wide window, but still present once
    // that window is widened past everything the flood produced — i.e.
    // Panoptes holds the event, and only a fixed registry-wide window would
    // miss it. Without this pair, a flood that silently failed would make
    // the assertion below pass while proving nothing.
    //
    // `FLOOD_COUNT + 100`: comfortably more than the flood's own event count
    // plus the noise name's registration grant — the only two sources of
    // activity between the target's grant and now — so it reaches back past
    // the target regardless of how many trailing events Panoptes dropped.
    const resource = labelToCanonicalId(label)
    expect(
      await indexerHasResourceInWindow(resource, MAX_EVENTS),
      'precondition: the target resource must have fallen out of a newest-1000 registry-wide window',
    ).toBe(false)
    expect(
      await indexerHasResourceInWindow(resource, FLOOD_COUNT + 100),
      'precondition: and still be present once the window is widened — the indexer has it, so absence above is the window, not a gap',
    ).toBe(true)

    // A fresh navigation avoids the baseline visit's cached react-query
    // result standing in for a real reload.
    await page.goto(rolesPage(name))
    const panel = parentRegistryRolesPanel(page)

    // The fix, asserted: the query is scoped to the resource and reads
    // indexed logs, so a registry-wide window that no longer contains the
    // grant is irrelevant. The holder stays listed.
    await expect(
      panel.locator('tr', { hasText: truncate(owner) }),
      'the owner must still be listed: role reads are scoped to the ' +
        "name's own resource, so 1000+ unrelated registry events cannot " +
        'age a real on-chain grant out of the panel (E2E-009)',
    ).toHaveCount(1, { timeout: ROLE_PANEL_TIMEOUT })
    await expect(
      panel.getByText('No role holders yet'),
      'and the empty state — indistinguishable from "nobody holds any role" — must not be shown',
    ).toBeHidden()
  })
})

/**
 * WEB-1418 (PR #1214) — a finished role change must not satisfy the next one.
 *
 * The bug: a transaction actor that reaches `success` stays in the manager's
 * map on purpose, so the modal can keep rendering the finished step. The
 * roles flows named their single step with a fixed id (`tx-grant-roles`,
 * `tx-revoke-roles`), so a second change in the same session looked up the
 * first change's actor: the step opened already "Done", showing the first
 * transaction's actual cost, and pressing Done sent nothing. The user sees a
 * completed change that never reached the chain.
 *
 * Reaching it needs the modal dismissed (X / Escape) rather than finished
 * with Done — Done runs `transactionManager.clear()`, which hides the bug.
 * Dismissing a successful modal is the supported "reopen and see the result"
 * path (`TransactionModal`'s `onOpenChange` only clears on error).
 *
 * The fix: `useFlowAttempt` names each attempt with a scope (account +
 * nonce) that `scopeTransactionId` appends to the step id, and the manager
 * retires another account's settled actors on an account switch.
 *
 * What these reach that the unit tests don't: the real sheet → modal →
 * wallet path with the real module-level manager surviving between two
 * attempts in one page, a real `accountsChanged` switch, and the chain
 * bitmap as the oracle for "the second change actually happened".
 */
test.describe('Portal name roles — repeat changes in one session (WEB-1418)', () => {
  /** A console line for `baseId`'s step reaching success, scoped or not. */
  const successLine = (baseId: string) =>
    new RegExp(`Transaction ${baseId}(--\\S+)? state: success`)

  /**
   * Sends the open modal's single step and then *dismisses* the modal with
   * Escape instead of pressing Done — the path that leaves the finished actor
   * in the manager. Returns the id the step was logged under.
   */
  async function sendThenDismiss(
    page: Page,
    wallet: Web3ProviderBackend,
    baseId: string,
  ): Promise<string> {
    const dialog = page.locator('[data-slot="dialog-content"]')
    await expect(dialog).toBeVisible({ timeout: 30_000 })

    let loggedId: string | undefined
    const onConsole = (msg: { text(): string }) => {
      const match = msg.text().match(successLine(baseId))
      if (match) loggedId = `${baseId}${match[1] ?? ''}`
    }
    page.on('console', onConsole)
    try {
      const deadline = Date.now() + 120_000
      while (!loggedId && Date.now() < deadline) {
        const openWallet = dialog.getByRole('button', { name: /open wallet/i })
        if (await openWallet.isVisible().catch(() => false)) {
          await openWallet.click()
          await authorizeTransaction(wallet, 60_000)
          continue
        }
        const start = dialog.getByRole('button', { name: /^(Start|Next)$/i })
        if (
          (await start.isVisible().catch(() => false)) &&
          (await start.isEnabled().catch(() => false))
        ) {
          await start.click()
        }
        await page.waitForTimeout(500)
      }
    } finally {
      page.off('console', onConsole)
    }
    expect(loggedId, `${baseId} never logged success`).toBeDefined()

    // The finished step is on screen, with its Done button — which is exactly
    // what must NOT be pressed here.
    await expect(dialog.getByRole('button', { name: 'Done' })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
    return loggedId as string
  }

  /**
   * The second attempt's modal, asserted on the symptom first (softly, so
   * the chain read still runs and is what the failure reports), then driven.
   * `driveTransactionsToSuccess`'s own count assertion is caught: on the
   * buggy build it has nothing to count, and the chain read below is the
   * better witness of that.
   */
  async function driveSecondAttempt(
    page: Page,
    wallet: Web3ProviderBackend,
    baseId: string,
  ) {
    const dialog = page.locator('[data-slot="dialog-content"]')
    await expect(dialog).toBeVisible({ timeout: 30_000 })
    await expect
      .soft(
        dialog.getByText('Not Started'),
        "the second attempt must open unsent, not as the first attempt's finished step",
      )
      .toBeVisible({ timeout: 10_000 })
    await expect
      .soft(
        dialog.getByText('Actual Cost'),
        "an actual cost on an unsent step is the first attempt's receipt",
      )
      .toHaveCount(0)
    await driveTransactionsToSuccess(page, wallet, [baseId], 60_000).catch(
      () => undefined,
    )
  }

  const openAddUser = async (page: Page) => {
    await page.getByRole('button', { name: 'Add user' }).click()
    await expect(page.getByRole('heading', { name: 'Add user' })).toBeVisible({
      timeout: 20_000,
    })
  }

  test('a second grant after dismissing the first asks the wallet again and lands on-chain', {
    tag: ['@smoke'],
  }, async ({ portalPage: page, wallet, makeName, wallets }) => {
    await connectWithHeadlessWallet(page, wallet)

    const manager = wallets.address('manager')
    const stranger = wallets.address('stranger')
    const name = await makeName({ label: 'roles-w1418-grant', owner: 'user' })
    const label = name.replace(/\.eth$/, '')
    await assertRoleBitmap({ label }, stranger, [])

    await page.goto(rolesPage(name))

    // Attempt 1 — the legitimate path, and the positive control: it reaches
    // the chain.
    await openAddUser(page)
    await page.getByLabel('User name or address').fill(manager)
    await page.locator('#add-ROLE_SET_RESOLVER-manager').click()
    await page.getByRole('button', { name: 'Save' }).click()
    const firstId = await sendThenDismiss(
      page,
      wallet,
      PORTAL_TRANSACTION_IDS.grantRoles,
    )
    await assertRoleBitmap({ label }, manager, ['ROLE_SET_RESOLVER'])

    // Close the sheet the modal was opened from, then start over — same
    // page, same in-memory transaction manager.
    await page.keyboard.press('Escape')
    await expect(page.getByRole('heading', { name: 'Add user' })).toBeHidden()

    // Attempt 2, for a different grantee.
    await openAddUser(page)
    await page.getByLabel('User name or address').fill(stranger)
    await page.locator('#add-ROLE_SET_RESOLVER-manager').click()
    await page.getByRole('button', { name: 'Save' }).click()
    await driveSecondAttempt(page, wallet, PORTAL_TRANSACTION_IDS.grantRoles)

    // The oracle: the second grant exists on-chain. Before the fix the step
    // opened as the first grant's receipt and nothing was sent.
    await assertRoleBitmap({ label }, stranger, ['ROLE_SET_RESOLVER'])
    // Scoped ids are what keep the two attempts apart.
    expect(firstId).not.toBe(PORTAL_TRANSACTION_IDS.grantRoles)
  })

  test('a second revoke from the role editor revokes on-chain instead of replaying the first', async ({
    portalPage: page,
    wallet,
    makeName,
    wallets,
  }) => {
    await connectWithHeadlessWallet(page, wallet)

    const manager = wallets.address('manager')
    const name = await makeName({ label: 'roles-w1418-revoke', owner: 'user' })
    const label = name.replace(/\.eth$/, '')

    // Precondition on-chain, so a grant regression can't masquerade as this.
    await grantNameRoles(
      { label },
      manager,
      ['ROLE_SET_RESOLVER', 'ROLE_SET_SUBREGISTRY'],
      wallets.account('owner'),
    )
    await awaitIndexed(label, [manager])

    await page.goto(rolesPage(name))
    const managerRow = parentRegistryRolesPanel(page).locator('tr', {
      hasText: truncate(manager),
    })
    await expect(managerRow).toHaveCount(1, { timeout: 30_000 })

    // Revoke 1 — the positive control.
    await managerRow.getByRole('button', { name: 'Edit user roles' }).click()
    await expect(
      page.getByRole('heading', { name: truncate(manager) }),
    ).toBeVisible({ timeout: 20_000 })
    await page.locator('#ROLE_SET_RESOLVER-manager').click()
    await page.getByRole('button', { name: 'Save' }).click()
    await sendThenDismiss(page, wallet, PORTAL_TRANSACTION_IDS.revokeRoles)
    await assertRoleBitmap({ label }, manager, ['ROLE_SET_SUBREGISTRY'])

    // Revoke 2, same session, same editor.
    await managerRow.getByRole('button', { name: 'Edit user roles' }).click()
    await expect(
      page.getByRole('heading', { name: truncate(manager) }),
    ).toBeVisible({ timeout: 20_000 })
    await page.locator('#ROLE_SET_SUBREGISTRY-manager').click()
    await page.getByRole('button', { name: 'Save' }).click()
    await driveSecondAttempt(page, wallet, PORTAL_TRANSACTION_IDS.revokeRoles)

    await assertRoleBitmap({ label }, manager, [])
  })

  test("after an account switch, the new wallet's grant is not satisfied by the previous wallet's receipt", async ({
    portalPage: page,
    wallet,
    makeName,
    wallets,
  }) => {
    await connectWithHeadlessWallet(page, wallet)

    const stranger = wallets.address('stranger')
    // A throwaway grantee, so the oracle can't be satisfied by anything else.
    const grantee = privateKeyToAddress(generatePrivateKey())
    const ownersName = await makeName({
      label: 'roles-w1418-switch-a',
      owner: 'user',
    })
    const managersName = await makeName({
      label: 'roles-w1418-switch-b',
      owner: 'user2',
    })
    const ownersLabel = ownersName.replace(/\.eth$/, '')
    const label = managersName.replace(/\.eth$/, '')
    await assertRoleBitmap({ label }, grantee, [])

    await page.goto(rolesPage(ownersName))

    // The owner's attempt, dismissed — its finished actor stays behind.
    await openAddUser(page)
    await page.getByLabel('User name or address').fill(stranger)
    await page.locator('#add-ROLE_SET_RESOLVER-manager').click()
    await page.getByRole('button', { name: 'Save' }).click()
    await sendThenDismiss(page, wallet, PORTAL_TRANSACTION_IDS.grantRoles)
    await assertRoleBitmap({ label: ownersLabel }, stranger, [
      'ROLE_SET_RESOLVER',
    ])
    await page.keyboard.press('Escape')
    await expect(page.getByRole('heading', { name: 'Add user' })).toBeHidden()

    // A real `accountsChanged`, and a client-side navigation to the manager's
    // own name: no reload, so the transaction manager's map survives.
    await wallets.switchTo('manager')
    await page.evaluate((path) => {
      window.history.pushState({}, '', path)
      window.dispatchEvent(new PopStateEvent('popstate'))
    }, `/${managersName}/roles`)
    await expect(
      page.getByRole('link', { name: managersName }).first(),
    ).toBeVisible({ timeout: 20_000 })

    await openAddUser(page)
    await page.getByLabel('User name or address').fill(grantee)
    await page.locator('#add-ROLE_SET_RESOLVER-manager').click()
    await page.getByRole('button', { name: 'Save' }).click()
    await driveSecondAttempt(page, wallet, PORTAL_TRANSACTION_IDS.grantRoles)

    await assertRoleBitmap({ label }, grantee, ['ROLE_SET_RESOLVER'])
  })
})

/**
 * Remove user on a role holder's row (WEB-1487, Immunefi #92542, #1269).
 *
 * Bug: the sidebar's Remove user passed the row's raw decoded role list to
 * `revokeRoles`. On a `.eth` 2LD that list includes `ROLE_CAN_TRANSFER_ADMIN`,
 * which `PermissionedRegistry._update` checks on the token owner, and which no
 * account can grant back once its last holder loses it. Removing the owner's
 * own row froze the name for the rest of its term, behind a confirmation that
 * only warned about "adding more users".
 *
 * Fix: `buildRemoveUserPlan` keeps the transfer role back (and any role the
 * caller isn't admin for), and `RemoveUserConfirmDialog` names exactly what is
 * revoked and why anything is kept.
 *
 * What these reach that `removeUserPlan.test.ts` doesn't: the real role set the
 * registrar grants, the caller and root-holder reads `useRemoveUserPlan` makes,
 * the bitmap the transaction actually encodes, and whether the registry still
 * lets the owner transfer afterwards.
 */
test.describe('Portal name roles — Remove user keeps the transfer role (WEB-1487)', () => {
  test.describe.configure({ timeout: 240_000 })

  /**
   * Local Panoptes answers the typed `eacRolesChangeds` query with `null`,
   * which the reader can't recover from. Aborting it sends the app to its node
   * fallback, as an indexer outage would. Every log is still the chain's.
   */
  const useNodeForRoleEvents = (page: Page) =>
    page.route('**/graphql', (route) =>
      (route.request().postData() ?? '').includes('RoleChangeEvents')
        ? route.abort()
        : route.fallback(),
    )

  const rolesPanel = (page: Page) =>
    page
      .locator('h3', { hasText: 'parent registry / roles' })
      .locator('xpath=parent::div/following-sibling::*[1]')

  /** Opens `account`'s sheet from its row and presses Remove user. */
  async function openRemoveUser(page: Page, account: Address) {
    const row = rolesPanel(page).locator('tr', { hasText: truncate(account) })
    await expect(row).toHaveCount(1, { timeout: 60_000 })
    await row.getByRole('button', { name: 'Edit user roles' }).click()
    await expect(
      page.getByRole('heading', { name: truncate(account) }),
    ).toBeVisible({
      timeout: 20_000,
    })
    const remove = page.getByRole('button', { name: 'Remove user' })
    await expect(remove).toBeEnabled({ timeout: 20_000 })
    await remove.click()
    const confirm = page.getByRole('dialog', { name: 'Remove user' })
    await expect(confirm).toBeVisible()
    return confirm
  }

  test("removing the owner's own row keeps Can Transfer, and the name can still be transferred", {
    tag: ['@smoke'],
  }, async ({ portalPage: page, wallet, makeName, wallets }) => {
    await connectWithHeadlessWallet(page, wallet)

    const owner = wallets.address('owner')
    const name = await makeName({ label: 'roles-rm-owner', owner: 'user' })
    const label = name.replace(/\.eth$/, '')

    // The registrar's grant is the precondition the bug needs: the owner's row
    // carries the transfer role alongside the ones the sheet displays.
    const before = (await readNameRoles({ label }, owner)).decoded
    expect(
      before,
      'the registrar should grant the owner the transfer role',
    ).toContain('ROLE_CAN_TRANSFER_ADMIN')
    expect(
      (await readRoleHolders({ label })).size,
      'the owner should be the only holder, so it is the last transfer-role holder',
    ).toBe(1)

    await useNodeForRoleEvents(page)
    await page.goto(rolesPage(name))
    const confirm = await openRemoveUser(page, owner)

    // Soft, so the chain read below is what a pre-fix run reports.
    await expect
      .soft(
        confirm.getByText('Transfer permission is kept.'),
        'the dialog should say the transfer role is kept',
      )
      .toBeVisible()
    await expect
      .soft(
        confirm.getByText(
          /no other account is admin for .*nobody can grant them back/i,
        ),
        'revoking the sole admin roles should be flagged as destructive',
      )
      .toBeVisible()
    await confirm.getByRole('button', { name: 'Remove', exact: true }).click()
    // Its close animation leaves a second dialog-content in the DOM.
    await expect(
      page.locator('[data-slot="dialog-content"][data-state="closed"]'),
    ).toHaveCount(0, { timeout: 15_000 })

    await driveTransactionsToSuccess(page, wallet, [
      PORTAL_TRANSACTION_IDS.revokeRoles,
    ])

    // Exactly the transfer role is left: it was kept, and everything else the
    // row held was still revoked, so the button didn't just do nothing.
    await assertRoleBitmap({ label }, owner, ['ROLE_CAN_TRANSFER_ADMIN'])

    // The behaviour the role exists for: the registry still lets the owner
    // move the name. Pre-fix this reverts `TransferDisallowed`. The revoke
    // re-mints the token, so the id is read back rather than derived.
    const readState = () =>
      publicClient.readContract({
        address: ETH_REGISTRY,
        abi: permissionedRegistryGetStateSnippet,
        functionName: 'getState',
        args: [labelToCanonicalId(label)],
      })
    const { tokenId } = await readState()
    const recipient = privateKeyToAddress(generatePrivateKey())
    const receipt = await registryWrite(
      wallets.account('owner'),
      encodeFunctionData({
        abi: REGISTRY_WRITE_ABI,
        functionName: 'safeTransferFrom',
        args: [owner, recipient, tokenId, 1n, '0x'],
      }),
    )
    expect(
      receipt.status,
      'the owner should still be able to transfer the name',
    ).toBe('success')
    expect(
      (await readState()).latestOwner,
      'the name should now belong to the recipient',
    ).toBe(recipient)
  })

  test("removing another holder's row revokes everything they hold, and leaves the owner alone", async ({
    portalPage: page,
    wallet,
    makeName,
    wallets,
  }) => {
    // Guard: the legitimate path behaves the same before and after the fix.
    await connectWithHeadlessWallet(page, wallet)

    const owner = wallets.address('owner')
    const manager = wallets.address('manager')
    const name = await makeName({ label: 'roles-rm-manager', owner: 'user' })
    const label = name.replace(/\.eth$/, '')

    await grantNameRoles(
      { label },
      manager,
      ['ROLE_SET_RESOLVER', 'ROLE_SET_SUBREGISTRY'],
      wallets.account('owner'),
    )
    const ownerBefore = (await readNameRoles({ label }, owner)).decoded

    await useNodeForRoleEvents(page)
    await page.goto(rolesPage(name))
    const confirm = await openRemoveUser(page, manager)

    // A non-owner row holds no transfer role, so nothing is held back.
    await expect(confirm.getByText('Transfer permission is kept.')).toHaveCount(
      0,
    )
    await confirm.getByRole('button', { name: 'Remove', exact: true }).click()
    // Its close animation leaves a second dialog-content in the DOM.
    await expect(
      page.locator('[data-slot="dialog-content"][data-state="closed"]'),
    ).toHaveCount(0, { timeout: 15_000 })

    await driveTransactionsToSuccess(page, wallet, [
      PORTAL_TRANSACTION_IDS.revokeRoles,
    ])

    await assertRoleBitmap({ label }, manager, [])
    await assertRoleBitmap({ label }, owner, ownerBefore)
  })
})

/**
 * Missing-privilege warnings on a v2 name (WEB-1469, #1311).
 *
 * Gap: a v2 name whose owner had lost token roles looked like any other name.
 * Nothing said that a transfer would revert (no `ROLE_CAN_TRANSFER_ADMIN`),
 * that it would revert `TransferUnsafeWithMultipleAssignees` (another account
 * holds roles on the token), or that the resolver or subregistry slot could no
 * longer be changed by anyone. The empty registry slot still offered
 * "Configure registry" to an owner who could not set it.
 *
 * Change: Ownership, Resolver and Registry read the token's role holders and
 * render a red badge with the missing roles in a tooltip, and the never-
 * configured registry slot becomes a locked notice unless the connected wallet
 * can set it anyway. A subregistry equal to the name's derived WrapperRegistry
 * is exempt.
 *
 * What these reach that the unit tests don't: real revocations on the fork,
 * read back through the app's own resource lookup and role-log read (the unit
 * tests mock that read); the badges' placement on the real routes; a delegate
 * holding the role on chain; the WrapperRegistry derivation checked
 * against a subregistry a real locked migration deployed; and a real grace
 * period and renewal through the portal's Extend modal, across which the
 * name's EAC resource changes and changes back. Every badge is
 * matched to the chain: the role bitmap, and where the badge makes a claim
 * about transfers, a simulated `safeTransferFrom`.
 *
 * Two local-stack workarounds, neither of which changes what the app reads:
 * - Local Panoptes answers `RoleChangeEvents` with `null`, which the reader
 *   can't recover from, so that query is aborted and the app reads the logs
 *   from the node, as it would in an indexer outage.
 * - Anvil forwards the pre-fork part of that `eth_getLogs` upstream. When the
 *   upstream errors, the app's retry can get `[]` back with no error, and the
 *   badges then read "owner holds nothing" (see the test plan's findings). So
 *   a page is only asserted on once its role read for the name came back
 *   without an error; a degraded load is reloaded, never accepted.
 */
test.describe('Portal name roles — missing-privilege warnings (WEB-1469)', () => {
  test.describe.configure({ timeout: 300_000 })

  const EAC_ROLES_CHANGED =
    '0x0d35bf721a39b614de00ca5038e1deb0cb0c69a278645e83405a7226cf80ba3c'
  const ZERO_TOPIC = `0x${'0'.repeat(64)}`

  const useNodeForRoleEvents = (page: Page) =>
    page.route('**/graphql', (route) =>
      (route.request().postData() ?? '').includes('RoleChangeEvents')
        ? route.abort()
        : route.fallback(),
    )

  type RpcCall = {
    id: number
    method: string
    params?: [{ address?: string; topics?: (string | null)[] }]
  }
  type RpcReply = { id: number; error?: unknown }

  /** An `eth_getLogs` for one name's role changes on the .eth registry. */
  const isNameRoleRead = (call: RpcCall) => {
    const filter = call.params?.[0]
    const resource = filter?.topics?.[1]
    return (
      call.method === 'eth_getLogs' &&
      filter?.address?.toLowerCase() === ETH_REGISTRY.toLowerCase() &&
      filter.topics?.[0] === EAC_ROLES_CHANGED &&
      Boolean(resource) &&
      resource !== ZERO_TOPIC
    )
  }

  /** How many of a response's name role reads answered, and how many errored. */
  async function tallyRoleReads(response: import('@playwright/test').Response) {
    const tally = { clean: 0, degraded: 0 }
    const body = response.request().postData() ?? ''
    if (!body.includes('eth_getLogs') || !body.includes(EAC_ROLES_CHANGED))
      return tally
    let calls: RpcCall[]
    let replies: RpcReply[]
    try {
      calls = [JSON.parse(body)].flat()
      replies = [await response.json()].flat()
    } catch {
      return tally
    }
    for (const call of calls.filter(isNameRoleRead)) {
      const reply = replies.find((r) => r.id === call.id)
      if (reply?.error) tally.degraded++
      else if (reply) tally.clean++
    }
    return tally
  }

  /**
   * Run `navigate` (a page load or an in-app click) and wait for the app's
   * role-log read for a name on the .eth registry. If any such read came back
   * with an error, the page is reloaded (up to three loads in all), since the
   * retry after it can't be trusted locally. Resolves to the number of clean
   * reads in the accepted load.
   *
   * A page that makes no such read (any page before #1311 but Ownership) is
   * let through after the wait: with nothing read there is nothing degraded,
   * and the test then fails on its own badge assertion, not here.
   */
  async function navigateWithCleanRoleRead(
    page: Page,
    navigate: () => Promise<unknown>,
    where: string,
  ): Promise<number> {
    for (let attempt = 1; attempt <= 3; attempt++) {
      const reads = { clean: 0, degraded: 0 }
      const onResponse = async (
        response: import('@playwright/test').Response,
      ) => {
        const tally = await tallyRoleReads(response)
        reads.clean += tally.clean
        reads.degraded += tally.degraded
      }
      page.on('response', onResponse)
      try {
        await (attempt === 1 ? navigate() : page.reload())
        await expect
          .poll(() => reads.clean + reads.degraded, { timeout: 20_000 })
          .toBeGreaterThan(0)
          .catch(() =>
            console.log(`[WEB-1469] no role read on ${where}; asserting as is`),
          )
        // An errored read is retried; let the retry land before judging.
        await page.waitForTimeout(1_500)
      } finally {
        page.off('response', onResponse)
      }
      if (reads.degraded === 0) return reads.clean
      console.log(
        `[WEB-1469] role read on ${where} hit ${reads.degraded} upstream error(s); reloading (attempt ${attempt})`,
      )
    }
    throw new Error(`no clean role read for ${where} in three loads`)
  }

  const gotoWithCleanRoleRead = (page: Page, url: string) =>
    navigateWithCleanRoleRead(page, () => page.goto(url), url)

  /**
   * Badge absence is only meaningful once the role read has landed and the
   * page has had time to render from it: the positive tests render the same
   * badge from the same read well inside this window.
   */
  const RENDER_SETTLE_MS = 2_000

  const badge = (page: Page, label: string) =>
    page.locator('main').getByRole('button', { name: label, exact: true })

  async function expectTooltip(page: Page, label: string, text: string) {
    await badge(page, label).hover()
    await expect(page.getByRole('tooltip')).toHaveText(text)
  }

  /**
   * The owner as the page shows it: its primary name when it has one, else the
   * truncated address. The shared `user` account picks up a primary name
   * whenever a registration test sets one, so matching only the address made
   * these tests depend on run order (2026-10-08).
   */
  const ownerRow = async (page: Page, owner: Address) => {
    const primary = await getName(publicClient as never, {
      address: owner,
    }).catch(() => null)
    const shown = [truncate(owner), ...(primary?.name ? [primary.name] : [])]
    const pattern = shown
      .map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      .join('|')
    return page
      .locator('main')
      .getByText(new RegExp(`^(${pattern})$`))
      .first()
  }

  const readState = (label: string) =>
    publicClient.readContract({
      address: ETH_REGISTRY,
      abi: permissionedRegistryGetStateSnippet,
      functionName: 'getState',
      args: [labelToCanonicalId(label)],
    })

  const readSubregistry = (label: string) =>
    publicClient.readContract({
      address: ETH_REGISTRY,
      abi: parseAbi([
        'function getSubregistry(string label) view returns (address)',
      ]),
      functionName: 'getSubregistry',
      args: [label],
    })

  /**
   * Whether the owner can move the name right now: `null` if a
   * `safeTransferFrom` to a fresh EOA simulates cleanly, else the revert. The
   * token id is read back because a revoke re-mints it.
   */
  async function simulateOwnerTransfer(
    label: string,
    owner: Address,
  ): Promise<string | null> {
    const { tokenId } = await readState(label)
    try {
      await publicClient.simulateContract({
        account: owner,
        address: ETH_REGISTRY,
        abi: REGISTRY_WRITE_ABI,
        functionName: 'safeTransferFrom',
        args: [
          owner,
          privateKeyToAddress(generatePrivateKey()),
          tokenId,
          1n,
          '0x',
        ],
      })
      return null
    } catch (error) {
      return (error as Error).message
    }
  }

  /** Whether `account` could point the name's resolver somewhere, simulated. */
  async function simulateSetResolver(
    label: string,
    account: Address,
  ): Promise<boolean> {
    try {
      await publicClient.simulateContract({
        account,
        address: ETH_REGISTRY,
        abi: REGISTRY_WRITE_ABI,
        functionName: 'setResolver',
        args: [labelToCanonicalId(label), account],
      })
      return true
    } catch {
      return false
    }
  }

  test('flags "Cannot transfer" once the owner loses ROLE_CAN_TRANSFER_ADMIN, and the registry agrees the transfer reverts', {
    tag: ['@smoke'],
  }, async ({ portalPage: page, makeName, wallets }) => {
    // Disconnected: the warning is about the name, not the viewer.
    const owner = wallets.address('owner')
    const name = await makeName({ label: 'priv-transfer', owner: 'user' })
    const label = name.replace(/\.eth$/, '')
    await useNodeForRoleEvents(page)

    // Control: the full role set a fresh 2LD gets raises nothing.
    expect(await simulateOwnerTransfer(label, owner)).toBeNull()
    await gotoWithCleanRoleRead(page, `${PORTAL_APP_URL}/${name}/ownership`)
    await expect(await ownerRow(page, owner)).toBeVisible({ timeout: 20_000 })
    await page.waitForTimeout(RENDER_SETTLE_MS)
    await expect(badge(page, 'Cannot transfer')).toHaveCount(0)
    await expect(badge(page, 'Cannot transfer safely')).toHaveCount(0)

    await revokeNameRoles(
      { label },
      owner,
      ['ROLE_CAN_TRANSFER_ADMIN'],
      wallets.account('owner'),
    )
    expect(
      await accountHasRoles({ label }, owner, ['ROLE_CAN_TRANSFER_ADMIN']),
    ).toBe(false)
    expect(
      await simulateOwnerTransfer(label, owner),
      'without ROLE_CAN_TRANSFER_ADMIN the registry should refuse the transfer',
    ).not.toBeNull()

    await gotoWithCleanRoleRead(page, `${PORTAL_APP_URL}/${name}/ownership`)
    await expect(await ownerRow(page, owner)).toBeVisible({ timeout: 20_000 })
    await expect(
      badge(page, 'Cannot transfer'),
      'the owner row should warn that the name cannot be transferred',
    ).toBeVisible({ timeout: 20_000 })
    await expectTooltip(
      page,
      'Cannot transfer',
      'Missing token ROLE_CAN_TRANSFER_ADMIN',
    )
  })

  test('flags "Cannot transfer safely" while another account holds roles on the token, and clears it once they hold none', async ({
    portalPage: page,
    wallet,
    makeName,
    wallets,
  }) => {
    const owner = wallets.address('owner')
    const manager = wallets.address('manager')
    const name = await makeName({ label: 'priv-unsafe', owner: 'user' })
    const label = name.replace(/\.eth$/, '')
    await useNodeForRoleEvents(page)
    // Someone else's name, from a connected wallet that holds nothing on it.
    await connectWithHeadlessWallet(page, wallet)
    await wallets.switchTo('stranger')

    await grantNameRoles(
      { label },
      manager,
      ['ROLE_SET_RESOLVER'],
      wallets.account('owner'),
    )
    // The owner still holds the transfer role, so this is the other warning.
    expect(
      await accountHasRoles({ label }, owner, ['ROLE_CAN_TRANSFER_ADMIN']),
    ).toBe(true)
    expect(
      await simulateOwnerTransfer(label, owner),
      'a plain transfer should revert TransferUnsafeWithMultipleAssignees',
    ).toContain('0x677f1c18')

    await gotoWithCleanRoleRead(page, `${PORTAL_APP_URL}/${name}/ownership`)
    await expect(await ownerRow(page, owner)).toBeVisible({ timeout: 20_000 })
    await expect(badge(page, 'Cannot transfer safely')).toBeVisible({
      timeout: 20_000,
    })
    await expect(badge(page, 'Cannot transfer')).toHaveCount(0)
    await expectTooltip(
      page,
      'Cannot transfer safely',
      'Another address holds roles on this token',
    )

    // Once the other holder is gone, the transfer is clean and so is the row.
    await revokeNameRoles(
      { label },
      manager,
      ['ROLE_SET_RESOLVER'],
      wallets.account('owner'),
    )
    expect(await simulateOwnerTransfer(label, owner)).toBeNull()
    await gotoWithCleanRoleRead(page, `${PORTAL_APP_URL}/${name}/ownership`)
    await expect(await ownerRow(page, owner)).toBeVisible({ timeout: 20_000 })
    await page.waitForTimeout(RENDER_SETTLE_MS)
    await expect(badge(page, 'Cannot transfer safely')).toHaveCount(0)
    await expect(badge(page, 'Cannot transfer')).toHaveCount(0)
  })

  test('flags "Resolver locked" next to the resolver contract when only the admin role is gone, naming just that role', async ({
    portalPage: page,
    makeName,
    wallets,
  }) => {
    const owner = wallets.address('owner')
    const name = await makeName({ label: 'priv-resolver', owner: 'user' })
    const label = name.replace(/\.eth$/, '')
    await useNodeForRoleEvents(page)
    const contractRow = page
      .locator('main')
      .getByText('Contract', { exact: true })
      .first()

    // Control.
    await gotoWithCleanRoleRead(page, `${PORTAL_APP_URL}/${name}/resolver`)
    await expect(contractRow).toBeVisible({ timeout: 20_000 })
    await page.waitForTimeout(RENDER_SETTLE_MS)
    await expect(badge(page, 'Resolver locked')).toHaveCount(0)

    // Only the admin variant gone: the owner can still set the resolver but
    // can't hand that power on. Same label; the tooltip says which role.
    // (The owner can't then revoke ROLE_SET_RESOLVER without the admin, so the
    // both-missing tooltip is covered by the next test.)
    await revokeNameRoles(
      { label },
      owner,
      ['ROLE_SET_RESOLVER_ADMIN'],
      wallets.account('owner'),
    )
    expect(
      await accountHasRoles({ label }, owner, ['ROLE_SET_RESOLVER_ADMIN']),
    ).toBe(false)
    expect(
      await simulateSetResolver(label, owner),
      'the owner should still be able to set the resolver',
    ).toBe(true)

    await gotoWithCleanRoleRead(page, `${PORTAL_APP_URL}/${name}/resolver`)
    await expect(contractRow).toBeVisible({ timeout: 20_000 })
    await expect(badge(page, 'Resolver locked')).toBeVisible({
      timeout: 20_000,
    })
    await expectTooltip(
      page,
      'Resolver locked',
      'Missing token ROLE_SET_RESOLVER_ADMIN',
    )

    // Scoped to its own role: the transfer role is untouched, so Ownership
    // stays clean.
    await gotoWithCleanRoleRead(page, `${PORTAL_APP_URL}/${name}/ownership`)
    await expect(await ownerRow(page, owner)).toBeVisible({ timeout: 20_000 })
    await page.waitForTimeout(RENDER_SETTLE_MS)
    await expect(badge(page, 'Cannot transfer')).toHaveCount(0)
  })

  test('flags "Resolver locked" on the "no resolver set" panel when the owner can never set one', async ({
    portalPage: page,
    makeName,
    wallets,
  }) => {
    const owner = wallets.address('owner')
    const name = await makeName({ label: 'priv-noresolver', owner: 'user' })
    const label = name.replace(/\.eth$/, '')
    await useNodeForRoleEvents(page)

    await registryWrite(
      wallets.account('owner'),
      encodeFunctionData({
        abi: REGISTRY_WRITE_ABI,
        functionName: 'setResolver',
        args: [labelToCanonicalId(label), zeroAddress],
      }),
    )
    await revokeNameRoles(
      { label },
      owner,
      ['ROLE_SET_RESOLVER', 'ROLE_SET_RESOLVER_ADMIN'],
      wallets.account('owner'),
    )
    expect(
      await simulateSetResolver(label, owner),
      'the owner should no longer be able to set the resolver',
    ).toBe(false)

    await gotoWithCleanRoleRead(page, `${PORTAL_APP_URL}/${name}/resolver`)
    await expect(
      page.locator('main').getByText('This name does not have a resolver set.'),
    ).toBeVisible({ timeout: 20_000 })
    await expect(badge(page, 'Resolver locked')).toBeVisible({
      timeout: 20_000,
    })
    await expectTooltip(
      page,
      'Resolver locked',
      'Missing token ROLE_SET_RESOLVER and ROLE_SET_RESOLVER_ADMIN',
    )
  })

  test('replaces "Configure registry" with a locked notice when the owner holds neither subregistry role', async ({
    portalPage: page,
    wallet,
    makeName,
    wallets,
  }) => {
    const owner = wallets.address('owner')
    const name = await makeName({ label: 'priv-registry', owner: 'user' })
    const label = name.replace(/\.eth$/, '')
    await useNodeForRoleEvents(page)
    await connectWithHeadlessWallet(page, wallet)
    const configure = page
      .locator('main')
      .getByRole('button', { name: 'Configure registry' })
    const lockedNotice = page
      .locator('main')
      .getByRole('alert')
      // The unlocked empty state carries the same title; this line is the
      // locked notice's own.
      .filter({ hasText: 'Subregistry is locked.' })

    // Control: an owner with the roles is offered the form.
    await gotoWithCleanRoleRead(page, `${PORTAL_APP_URL}/${name}/registry`)
    await expect(configure).toBeVisible({ timeout: 30_000 })
    await expect(lockedNotice).toHaveCount(0)

    await revokeNameRoles(
      { label },
      owner,
      ['ROLE_SET_SUBREGISTRY', 'ROLE_SET_SUBREGISTRY_ADMIN'],
      wallets.account('owner'),
    )
    expect(await readSubregistry(label)).toBe(zeroAddress)
    for (const role of [
      'ROLE_SET_SUBREGISTRY',
      'ROLE_SET_SUBREGISTRY_ADMIN',
    ] as const)
      expect(await accountHasRoles({ label }, owner, [role])).toBe(false)

    await gotoWithCleanRoleRead(page, `${PORTAL_APP_URL}/${name}/registry`)
    await expect(lockedNotice).toBeVisible({ timeout: 30_000 })
    await expect(lockedNotice).toContainText(
      'Subregistry is locked. Missing ROLE_SET_SUBREGISTRY and ROLE_SET_SUBREGISTRY_ADMIN',
    )
    await expect(
      configure,
      'an owner who cannot set the slot should not be offered the form',
    ).toHaveCount(0)
  })

  test('keeps "Configure registry" for a delegate who holds ROLE_SET_SUBREGISTRY when the owner holds neither', async ({
    portalPage: page,
    wallet,
    makeName,
    wallets,
  }) => {
    const owner = wallets.address('owner')
    const manager = wallets.address('manager')
    const name = await makeName({ label: 'priv-delegate', owner: 'user' })
    const label = name.replace(/\.eth$/, '')
    await useNodeForRoleEvents(page)
    await connectWithHeadlessWallet(page, wallet)
    const configure = page
      .locator('main')
      .getByRole('button', { name: 'Configure registry' })
    const lockedNotice = page
      .locator('main')
      .getByRole('alert')
      // The unlocked empty state carries the same title; this line is the
      // locked notice's own.
      .filter({ hasText: 'Subregistry is locked.' })

    await grantNameRoles(
      { label },
      manager,
      ['ROLE_SET_SUBREGISTRY'],
      wallets.account('owner'),
    )
    await revokeNameRoles(
      { label },
      owner,
      ['ROLE_SET_SUBREGISTRY', 'ROLE_SET_SUBREGISTRY_ADMIN'],
      wallets.account('owner'),
    )
    expect(
      await accountHasRoles({ label }, manager, ['ROLE_SET_SUBREGISTRY']),
    ).toBe(true)
    expect(
      await accountHasRoles({ label }, owner, ['ROLE_SET_SUBREGISTRY']),
    ).toBe(false)

    // The owner can't set the slot: locked.
    await gotoWithCleanRoleRead(page, `${PORTAL_APP_URL}/${name}/registry`)
    await expect(lockedNotice).toBeVisible({ timeout: 30_000 })
    await expect(configure).toHaveCount(0)

    // The delegate can, so the form it can use stays.
    await wallets.switchTo('manager')
    await gotoWithCleanRoleRead(page, `${PORTAL_APP_URL}/${name}/registry`)
    await expect(
      configure,
      'a wallet holding ROLE_SET_SUBREGISTRY should keep the form',
    ).toBeVisible({ timeout: 30_000 })
    await expect(lockedNotice).toHaveCount(0)
  })

  test('flags "Subregistry locked" on a configured subregistry once the owner holds neither subregistry role', async ({
    portalPage: page,
    makeName,
    wallets,
  }) => {
    const owner = wallets.address('owner')
    const name = await makeName({ label: 'priv-subreg', owner: 'user' })
    const label = name.replace(/\.eth$/, '')
    await useNodeForRoleEvents(page)

    const subregistry = await attachSubregistry(
      { label },
      wallets.account('owner'),
    )
    expect(await readSubregistry(label)).toBe(subregistry)
    const row = page.locator('main').getByText(truncate(subregistry)).first()

    // Control: a configured slot the owner controls raises nothing.
    await gotoWithCleanRoleRead(page, `${PORTAL_APP_URL}/${name}/registry`)
    await expect(row).toBeVisible({ timeout: 30_000 })
    await page.waitForTimeout(RENDER_SETTLE_MS)
    await expect(badge(page, 'Subregistry locked')).toHaveCount(0)

    await revokeNameRoles(
      { label },
      owner,
      ['ROLE_SET_SUBREGISTRY', 'ROLE_SET_SUBREGISTRY_ADMIN'],
      wallets.account('owner'),
    )
    for (const role of [
      'ROLE_SET_SUBREGISTRY',
      'ROLE_SET_SUBREGISTRY_ADMIN',
    ] as const)
      expect(await accountHasRoles({ label }, owner, [role])).toBe(false)

    await gotoWithCleanRoleRead(page, `${PORTAL_APP_URL}/${name}/registry`)
    await expect(row).toBeVisible({ timeout: 30_000 })
    await expect(badge(page, 'Subregistry locked')).toBeVisible({
      timeout: 20_000,
    })
    await expectTooltip(
      page,
      'Subregistry locked',
      'Missing token ROLE_SET_SUBREGISTRY and ROLE_SET_SUBREGISTRY_ADMIN',
    )
  })

  test('raises nothing for a locked migrated name: its subregistry is the WrapperRegistry the migration deployed', async ({
    portalPage: page,
    makeMigratedName,
    wallets,
  }) => {
    // Guard: pre-fix there are no badges at all, so this stays green there.
    // On the PR build it fails if the derived WrapperRegistry doesn't match
    // the one a real locked migration deploys on this chain.
    const owner = wallets.address('owner')
    const name = await makeMigratedName({
      label: 'priv-locked',
      type: 'locked',
    })
    const label = name.replace(/\.eth$/, '')
    await useNodeForRoleEvents(page)

    // The exact state the exemption exists for: a subregistry the owner holds
    // no subregistry role over, and a transfer role it does hold.
    const subregistry = await readSubregistry(label)
    expect(subregistry).not.toBe(zeroAddress)
    for (const role of [
      'ROLE_SET_SUBREGISTRY',
      'ROLE_SET_SUBREGISTRY_ADMIN',
    ] as const)
      expect(await accountHasRoles({ label }, owner, [role])).toBe(false)
    expect(
      await accountHasRoles({ label }, owner, ['ROLE_CAN_TRANSFER_ADMIN']),
    ).toBe(true)
    expect(await simulateOwnerTransfer(label, owner)).toBeNull()

    await gotoWithCleanRoleRead(page, `${PORTAL_APP_URL}/${name}/registry`)
    await expect(
      page.locator('main').getByText(truncate(subregistry)).first(),
    ).toBeVisible({ timeout: 30_000 })
    await page.waitForTimeout(RENDER_SETTLE_MS)
    await expect(
      badge(page, 'Subregistry locked'),
      'the canonical WrapperRegistry should be exempt',
    ).toHaveCount(0)

    await gotoWithCleanRoleRead(page, `${PORTAL_APP_URL}/${name}/ownership`)
    await expect(await ownerRow(page, owner)).toBeVisible({ timeout: 20_000 })
    await page.waitForTimeout(RENDER_SETTLE_MS)
    await expect(badge(page, 'Cannot transfer')).toHaveCount(0)
    await expect(badge(page, 'Cannot transfer safely')).toHaveCount(0)
  })

  // ── Grace (expiry < now < expiry + 28 days) ──────────────────────────────
  //
  // Measured on the fork: at expiry the registry hands the name a new EAC
  // resource version (`getResource` goes from …00 to …01) under which nobody
  // holds anything, so the chain reports the owner with no roles and
  // `safeTransferFrom` reverts `TransferDisallowed` (0xe58f6d5a). Renewing
  // switches back to the original resource, roles intact. A name in grace is
  // therefore not "missing privileges" in the sense these badges mean, and
  // the PR suppresses them; after renewal they must reflect the roles again.

  const SEPOLIA = ensL1Contracts[supportedL1Chains.sepolia]
  const TRANSFER_DISALLOWED = '0xe58f6d5a'
  const ALL_OWNER_ROLES = [
    'ROLE_CAN_TRANSFER_ADMIN',
    'ROLE_SET_RESOLVER',
    'ROLE_SET_RESOLVER_ADMIN',
    'ROLE_SET_SUBREGISTRY',
    'ROLE_SET_SUBREGISTRY_ADMIN',
  ] as const satisfies readonly Role[]

  const readResource = (label: string) =>
    publicClient.readContract({
      address: ETH_REGISTRY,
      abi: parseAbi(['function getResource(uint256) view returns (uint256)']),
      functionName: 'getResource',
      args: [BigInt(labelhash(label))],
    })

  /** Move the chain (and the page clock) to one day past `label`'s expiry. */
  async function warpIntoGrace(
    label: string,
    time: import('../../../fixtures/time.js').Time,
  ) {
    const { expiry } = await readState(label)
    const now = (await publicClient.getBlock()).timestamp
    await time.increaseTime({ seconds: Number(expiry - now) + 86_400 })
    const block = await publicClient.getBlock()
    expect(
      block.timestamp,
      'the name should be past its expiry',
    ).toBeGreaterThan(expiry)
    expect(
      block.timestamp,
      'and still inside the 28-day grace period',
    ).toBeLessThan(expiry + 28n * 86_400n)
  }

  /** Every privilege warning this PR can render, scoped to `main`. */
  async function expectNoPrivilegeWarnings(page: Page) {
    await page.waitForTimeout(RENDER_SETTLE_MS)
    for (const label of [
      'Cannot transfer',
      'Cannot transfer safely',
      'Resolver locked',
      'Subregistry locked',
    ])
      await expect(badge(page, label), `no "${label}" badge`).toHaveCount(0)
    await expect(
      page.locator('main').getByText('Subregistry is locked.'),
    ).toHaveCount(0)
  }

  /**
   * The tab body that loaded: either the tab itself (its owner row or its
   * heading row) or the "not registered" placeholder the routes show for a
   * name in grace. Either way, the page has finished deciding what to render.
   */
  const tabLoaded = (page: Page, tab: 'ownership' | 'resolver' | 'registry') =>
    page
      .locator('main')
      .getByText(`so there is no ${tab} data to display`)
      .or(
        page.locator('main').getByText(
          {
            ownership: 'Owner',
            resolver: 'Contract',
            registry: 'root registry',
          }[tab],
          { exact: true },
        ),
      )
      .first()

  /** Open `tab` from the name's sidebar, without a page load. */
  const clickTab = (
    page: Page,
    name: string,
    tab: 'Ownership' | 'Resolver' | 'Registry',
  ) =>
    page
      .locator(`a[href="/${name}/${tab.toLowerCase()}"]`)
      .filter({ visible: true })
      .first()
      .click()

  /**
   * Renew `name` through the portal's own Extend modal on its profile page,
   * as an owner in grace would. The registrar allowance is zeroed first so the
   * flow is always approve, then renew.
   */
  async function extendFromProfile(
    page: Page,
    wallet: Web3ProviderBackend,
    name: string,
    owner: Account,
  ) {
    const approve = await walletClient.sendTransaction({
      account: owner,
      to: SEPOLIA.usdc.address,
      data: encodeFunctionData({
        abi: parseAbi(['function approve(address,uint256) returns (bool)']),
        functionName: 'approve',
        args: [SEPOLIA.ensEthRegistrar.address, 0n],
      }),
    })
    await publicClient.waitForTransactionReceipt({ hash: approve })

    await page
      .locator('main')
      .getByRole('button', { name: 'Extend', exact: true })
      .first()
      .click()
    const extendDialog = page.getByRole('dialog')
    // In grace the modal first warns that extending doesn't change the owner.
    const acknowledge = extendDialog.getByRole('button', {
      name: 'I Understand',
    })
    await expect(
      acknowledge.or(extendDialog.getByText('Extend name')),
    ).toBeVisible()
    if (await acknowledge.isVisible()) await acknowledge.click()
    await expect(extendDialog.getByText('Extend name')).toBeVisible()
    await extendDialog.getByRole('button', { name: 'Next' }).click()
    await expect(extendDialog.getByText('Confirm extension')).toBeVisible()
    await extendDialog.getByRole('button', { name: /^USDC/ }).click()
    await extendDialog.getByRole('button', { name: 'Confirm' }).click()
    // The Extend dialog's close animation overlaps the transaction modal.
    await expect(
      page.locator('[data-slot="dialog-content"][data-state="closed"]'),
    ).toHaveCount(0, { timeout: 15_000 })
    await driveTransactionsToSuccess(page, wallet, [
      `renewal-approve-${SEPOLIA.ensEthRegistrar.address}`,
      `renewal-renew-${name}`,
    ])
    // Its close animation can leave a dialog in the DOM briefly.
    await page.keyboard.press('Escape')
    await expect(page.locator('[data-slot="dialog-content"]')).toHaveCount(0, {
      timeout: 15_000,
    })
  }

  test('suppresses every privilege warning while the name is in grace, and brings them back once the owner renews it', async ({
    portalPage: page,
    wallet,
    makeName,
    wallets,
    time,
  }) => {
    const owner = wallets.address('owner')
    const name = await makeName({ label: 'priv-grace', owner: 'user' })
    const label = name.replace(/\.eth$/, '')
    await useNodeForRoleEvents(page)
    await connectWithHeadlessWallet(page, wallet)

    await revokeNameRoles(
      { label },
      owner,
      [...ALL_OWNER_ROLES],
      wallets.account('owner'),
    )
    const activeResource = await readResource(label)
    for (const role of ALL_OWNER_ROLES)
      expect(await accountHasRoles({ label }, owner, [role])).toBe(false)

    // Positive control while active: every warning shows.
    await gotoWithCleanRoleRead(page, `${PORTAL_APP_URL}/${name}/ownership`)
    await expect(badge(page, 'Cannot transfer')).toBeVisible({
      timeout: 20_000,
    })
    await gotoWithCleanRoleRead(page, `${PORTAL_APP_URL}/${name}/resolver`)
    await expect(badge(page, 'Resolver locked')).toBeVisible({
      timeout: 20_000,
    })
    await gotoWithCleanRoleRead(page, `${PORTAL_APP_URL}/${name}/registry`)
    await expect(
      page.locator('main').getByText('Subregistry is locked.'),
    ).toBeVisible({ timeout: 30_000 })

    // ── Into grace ──
    await warpIntoGrace(label, time)
    expect(
      await readResource(label),
      'expiry should move the name to a new resource version',
    ).not.toBe(activeResource)
    expect(await simulateOwnerTransfer(label, owner)).toContain(
      TRANSFER_DISALLOWED,
    )

    // The profile says it's in grace, and offers the way out.
    await page.goto(`${PORTAL_APP_URL}/${name}`)
    await expect(
      page.locator('main').getByText('This name has expired'),
    ).toBeVisible({ timeout: 30_000 })
    await expect(
      page.locator('main').getByText(/The grace period for this name ends on/),
    ).toBeVisible()
    await expectNoPrivilegeWarnings(page)

    for (const tab of ['ownership', 'resolver', 'registry'] as const) {
      await gotoWithCleanRoleRead(page, `${PORTAL_APP_URL}/${name}/${tab}`)
      await expect(tabLoaded(page, tab)).toBeVisible({ timeout: 30_000 })
      await expectNoPrivilegeWarnings(page)
    }

    // ── Renewed through the portal ──
    await waitForIndexedName(name)
    await page.goto(`${PORTAL_APP_URL}/${name}`)
    await expect(
      page.locator('main').getByText('This name has expired'),
    ).toBeVisible({ timeout: 30_000 })
    await extendFromProfile(page, wallet, name, wallets.account('owner'))
    await expect
      .poll(async () => (await readState(label)).expiry, { timeout: 30_000 })
      .toBeGreaterThan((await publicClient.getBlock()).timestamp)
    expect(await readResource(label)).toBe(activeResource)
    // Renewal restores the resource, not the roles the owner gave up.
    for (const role of ALL_OWNER_ROLES)
      expect(await accountHasRoles({ label }, owner, [role])).toBe(false)
    expect(await simulateOwnerTransfer(label, owner)).not.toBeNull()

    // The tabs below read the name's state from Panoptes, which can still be
    // behind the renewal block when the whole file runs (seen 2026-10-08: the
    // fresh ownership tab still said "Grace ends"; the test passed alone).
    await waitForIndexedBlock()

    // The warnings are back. Each tab is loaded fresh: in-app navigation
    // after a renewal from grace still shows the grace-era "Name not
    // registered" until a reload (see the test plan's findings), which hides
    // every badge whatever this PR does.
    await gotoWithCleanRoleRead(page, `${PORTAL_APP_URL}/${name}/ownership`)
    await expect(badge(page, 'Cannot transfer')).toBeVisible({
      timeout: 20_000,
    })
    await gotoWithCleanRoleRead(page, `${PORTAL_APP_URL}/${name}/resolver`)
    await expect(badge(page, 'Resolver locked')).toBeVisible({
      timeout: 20_000,
    })
    await gotoWithCleanRoleRead(page, `${PORTAL_APP_URL}/${name}/registry`)
    await expect(
      page.locator('main').getByText('Subregistry is locked.'),
    ).toBeVisible({ timeout: 30_000 })
  })

  test('raises nothing for a fully privileged name once it is renewed from grace, though the resource it is read under moved and moved back', async ({
    portalPage: page,
    wallet,
    makeName,
    wallets,
    time,
  }) => {
    // Guard: pre-fix there are no badges at all. On the PR build it fails if
    // the warning keeps the grace-era resource (no role logs under it) after
    // renewal, which would read as "owner holds nothing".
    const owner = wallets.address('owner')
    const name = await makeName({ label: 'priv-renewed', owner: 'user' })
    const label = name.replace(/\.eth$/, '')
    await useNodeForRoleEvents(page)
    await connectWithHeadlessWallet(page, wallet)
    const activeResource = await readResource(label)

    // Warm the session's cache on the active name.
    await gotoWithCleanRoleRead(page, `${PORTAL_APP_URL}/${name}/ownership`)
    await expect(await ownerRow(page, owner)).toBeVisible({ timeout: 20_000 })
    await expectNoPrivilegeWarnings(page)

    await warpIntoGrace(label, time)
    expect(await readResource(label)).not.toBe(activeResource)
    expect(
      await accountHasRoles({ label }, owner, ['ROLE_CAN_TRANSFER_ADMIN']),
      'in grace the chain reports no roles',
    ).toBe(false)

    // Same session, in-app: the profile in grace, then the tabs.
    await waitForIndexedName(name)
    await page.getByRole('link', { name, exact: true }).first().click()
    await expect(
      page.locator('main').getByText('This name has expired'),
    ).toBeVisible({ timeout: 30_000 })
    await navigateWithCleanRoleRead(
      page,
      () => clickTab(page, name, 'Ownership'),
      'Ownership in grace',
    )
    await expect(tabLoaded(page, 'ownership')).toBeVisible({ timeout: 30_000 })
    await expectNoPrivilegeWarnings(page)

    await page.goBack()
    await expect(
      page.locator('main').getByText('This name has expired'),
    ).toBeVisible({ timeout: 30_000 })
    await extendFromProfile(page, wallet, name, wallets.account('owner'))
    await expect
      .poll(() => readResource(label), { timeout: 30_000 })
      .toBe(activeResource)
    for (const role of ALL_OWNER_ROLES)
      expect(await accountHasRoles({ label }, owner, [role])).toBe(true)
    expect(
      await simulateOwnerTransfer(label, owner),
      'after renewal the owner can transfer again',
    ).toBeNull()

    // Loaded fresh (see the first grace test for why not in-app), and nothing
    // may be flagged. Ownership reads the roles on either build, so it must
    // have read them here; the first grace test shows the other two tabs
    // render their badges from a fresh load after renewal.
    for (const tab of ['ownership', 'resolver', 'registry'] as const) {
      const reads = await gotoWithCleanRoleRead(
        page,
        `${PORTAL_APP_URL}/${name}/${tab}`,
      )
      if (tab === 'ownership')
        expect(
          reads,
          'Ownership should read the roles after renewal',
        ).toBeGreaterThan(0)
      await expect(tabLoaded(page, tab)).toBeVisible({ timeout: 30_000 })
      await expectNoPrivilegeWarnings(page)
    }
    await expect(
      page.locator('main').getByRole('button', { name: 'Configure registry' }),
      'an owner holding the subregistry roles keeps the form',
    ).toBeVisible({ timeout: 30_000 })
  })
})

/**
 * WEB-1484 (#1313) — role holders replayed from the indexer, checked against
 * the registry.
 *
 * The bug: the "parent registry / roles" list is a replay of the name's
 * `EACRolesChanged` history, and any history the indexer answered was taken as
 * complete. A short or empty one (indexer lag, missing rows, a resource
 * mismatch) rendered "No role holders yet" with no revoke control, left the
 * ownership page's Managers row blank, and gave the transfer form a holder list
 * missing someone: no revoke step was offered, the registry then refused the
 * transfer because another account still held roles, and the owner was told
 * "The transfer itself would fail" with a hint about contract recipients.
 * Separately, a history longer than one 1,000-row page went straight to the
 * slow node scan.
 *
 * The fix pins a block, checks the replay against `roleCount` and `roles` on
 * the registry at that block, re-reads the node when they disagree, and flags
 * the result unverified when it still can't be confirmed. The indexed read now
 * pages by block.
 *
 * What these reach that the unit tests don't: the real registry's `roleCount`
 * packing on a real name, the real node fallback through the portal's RPC
 * proxy, the three UIs that render the list, and a real transfer.
 *
 * Local Panoptes can't serve the typed `RoleChangeEvents` query (it answers
 * `null`), so each test serves that query itself, from the chain's own logs for
 * the name, with rows dropped or padded to make the history the bug needs. The
 * served rows page the way the indexer does: `blockNumber >= fromBlock`,
 * ordered by block, cut at `first`. Every oracle is the chain.
 */
test.describe('Portal name roles — role holders checked against the registry (WEB-1484)', () => {
  test.describe.configure({ timeout: 300_000 })

  const ROLES_FROM_BLOCK = 11_820_291n
  const EAC_ROLES_CHANGED = parseAbiItem(
    'event EACRolesChanged(uint256 indexed resource, address indexed account, uint256 oldRoleBitmap, uint256 newRoleBitmap)',
  )

  type IndexedRow = {
    id: string
    blockNumber: string
    timestamp: string
    transactionHash: Hex
    asEACRolesChanged: {
      resource: Hex
      account: Address
      oldRoleBitmap: Hex
      newRoleBitmap: Hex
    }
  }

  const resourceHex = (resource: bigint) =>
    `0x${resource.toString(16).padStart(64, '0')}` as Hex

  /** The name's current EAC resource, as the registry reports it. */
  const readResource = (label: string) =>
    publicClient.readContract({
      address: ETH_REGISTRY,
      abi: parseAbi(['function getResource(uint256) view returns (uint256)']),
      functionName: 'getResource',
      args: [labelToCanonicalId(label)],
    })

  /**
   * The name's role history as indexer rows, read from the chain. Bounded to
   * the recent blocks the name was made in, since a pre-fork range is
   * forwarded upstream by Anvil and can come back empty.
   */
  async function chainRoleRows(resource: bigint): Promise<IndexedRow[]> {
    const head = await publicClient.getBlockNumber()
    const logs = await publicClient.getLogs({
      address: ETH_REGISTRY,
      event: EAC_ROLES_CHANGED,
      args: { resource },
      fromBlock: head - 300n,
      strict: true,
    })
    const timestamps = new Map<bigint, bigint>()
    for (const { blockNumber } of logs) {
      if (!timestamps.has(blockNumber))
        timestamps.set(
          blockNumber,
          (await publicClient.getBlock({ blockNumber })).timestamp,
        )
    }
    return logs.map((log) => ({
      id: `${log.transactionHash}-${log.logIndex}`,
      blockNumber: log.blockNumber.toString(),
      timestamp: String(timestamps.get(log.blockNumber)),
      transactionHash: log.transactionHash,
      asEACRolesChanged: {
        resource: resourceHex(log.args.resource),
        account: log.args.account.toLowerCase() as Address,
        oldRoleBitmap: toHex(log.args.oldRoleBitmap),
        newRoleBitmap: toHex(log.args.newRoleBitmap),
      },
    }))
  }

  const rowsFor = (rows: IndexedRow[], account: Address) =>
    rows.filter(
      (row) =>
        row.asEACRolesChanged.account.toLowerCase() === account.toLowerCase(),
    )

  /**
   * Serves `RoleChangeEvents` from `rows` and records each request's
   * variables. Pages like the indexer: `first` rows from `fromBlock` on, in
   * block order.
   */
  async function serveIndexedHistory(page: Page, rows: IndexedRow[]) {
    const requests: { fromBlock: number; first: number; resource: string }[] =
      []
    const ordered = [...rows].sort(
      (a, b) =>
        Number(BigInt(a.blockNumber) - BigInt(b.blockNumber)) ||
        Number(a.id.split('-')[1]) - Number(b.id.split('-')[1]),
    )
    await page.route('**/graphql', (route) => {
      const body = route.request().postData() ?? ''
      if (!body.includes('RoleChangeEvents')) return route.fallback()
      const { variables } = JSON.parse(body) as {
        variables: { fromBlock: number; first: number; resource: string }
      }
      requests.push(variables)
      const page = ordered
        .filter(
          (row) =>
            row.asEACRolesChanged.resource === variables.resource &&
            Number(row.blockNumber) >= variables.fromBlock,
        )
        .slice(0, variables.first)
      return route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ data: { eacRolesChangeds: page } }),
      })
    })
    return requests
  }

  type RpcCall = {
    id: number
    method: string
    params?: [{ topics?: (string | null)[] }]
  }

  /** A node read of this resource's role history. */
  const isResourceRoleRead = (call: RpcCall, resource: bigint) =>
    call.method === 'eth_getLogs' &&
    call.params?.[0]?.topics?.[1]?.toLowerCase() === resourceHex(resource)

  /** The resource's role-history reads in one JSON-RPC request, if any. */
  const roleReadsIn = (
    request: import('@playwright/test').Request,
    resource: bigint,
  ): RpcCall[] => {
    const body = request.method() === 'POST' ? (request.postData() ?? '') : ''
    if (!body.includes('eth_getLogs')) return []
    try {
      return ([JSON.parse(body)].flat() as RpcCall[]).filter((call) =>
        isResourceRoleRead(call, resource),
      )
    } catch {
      return []
    }
  }

  /**
   * Counts the page's node reads of the resource's role history. With
   * `fail`, each one is answered with an RPC error, as a node that can't serve
   * the range would; every other call in the batch gets the node's answer.
   *
   * Every endpoint, not just the portal's `/rpc` proxy: the app's transport
   * fails over to Sepolia's public nodes, which can't see this fork and answer
   * an empty history, so failing only the proxy would test a node that
   * answered "nobody" rather than one that was down.
   */
  async function watchNodeRoleReads(
    page: Page,
    resource: bigint,
    { fail = false } = {},
  ) {
    const reads = { count: 0 }
    await page.route('**/*', async (route) => {
      const matching = roleReadsIn(route.request(), resource)
      if (matching.length === 0) return route.fallback()
      reads.count += matching.length
      if (!fail) return route.fallback()

      const response = await route.fetch()
      const answer: unknown = await response.json()
      const isBatch = Array.isArray(answer)
      const replies = [answer].flat() as { id: number }[]
      const failed = replies.map((reply) =>
        matching.some((call) => call.id === reply.id)
          ? {
              jsonrpc: '2.0',
              id: reply.id,
              error: { code: -32000, message: 'e2e: node unavailable' },
            }
          : reply,
      )
      return route.fulfill({
        response,
        body: JSON.stringify(isBatch ? failed : failed[0]),
      })
    })
    return reads
  }

  const UNVERIFIED =
    "Couldn't confirm this list against the registry, so some role holders may be missing."

  /** Owner plus a manager holding Set Resolver: two holders on chain. */
  async function nameWithManager(
    makeName: (o: { label: string; owner: 'user' }) => Promise<string>,
    wallets: {
      address: (who: 'owner' | 'manager') => Address
      account: (who: 'owner') => Account
    },
    labelPrefix: string,
  ) {
    const owner = wallets.address('owner')
    const manager = wallets.address('manager')
    const name = await makeName({ label: labelPrefix, owner: 'user' })
    const label = name.replace(/\.eth$/, '')
    await grantNameRoles(
      { label },
      manager,
      ['ROLE_SET_RESOLVER'],
      wallets.account('owner'),
    )
    expect(
      (await readNameRoles({ label }, manager)).decoded,
      'setup: the manager holds Set Resolver on chain',
    ).toEqual(['ROLE_SET_RESOLVER'])
    expect(
      (await readNameRoles({ label }, owner)).decoded.length,
      'setup: the owner holds roles on chain',
    ).toBeGreaterThan(0)
    const resource = await readResource(label)
    const rows = await chainRoleRows(resource)
    expect(
      rowsFor(rows, manager).length,
      "setup: the chain has the manager's grant log",
    ).toBeGreaterThan(0)
    return { name, label, owner, manager, resource, rows }
  }

  /**
   * The panel's list: the table or the empty state. Unlike
   * {@link parentRegistryRolesPanel} it steps over the unverified warning,
   * which the fix renders between the heading row and the table.
   */
  const rolesList = (page: Page) =>
    page
      .locator('h3', { hasText: 'parent registry / roles' })
      .locator('xpath=parent::div/following-sibling::*[not(@role="alert")][1]')

  /** The panel has settled: the table, the empty state or the warning. */
  async function panelSettled(page: Page) {
    const panel = rolesList(page)
    await expect(
      page
        .locator('main')
        .getByText('No role holders yet')
        .or(page.locator('main').getByText(UNVERIFIED))
        .or(panel.locator('tbody tr').first())
        .first(),
    ).toBeVisible({ timeout: 60_000 })
    return panel
  }

  test('an empty indexed history still lists every holder on chain (the report repro, disconnected)', {
    tag: ['@smoke'],
  }, async ({ portalPage: page, makeName, wallets }) => {
    const { name, owner, manager, resource } = await nameWithManager(
      makeName,
      wallets,
      'roles-1484-empty',
    )

    // The indexer has nothing for the name, as one lagging behind it would.
    const indexed = await serveIndexedHistory(page, [])
    const node = await watchNodeRoleReads(page, resource)
    await page.goto(rolesPage(name))
    const panel = await panelSettled(page)

    await expect(
      page.locator('main').getByText('No role holders yet'),
      'pre-fix: an empty indexed history was taken as complete',
    ).toHaveCount(0)
    for (const account of [owner, manager])
      await expect(
        panel.locator('tr', { hasText: truncate(account) }),
        `${account} holds roles on chain and must be listed`,
      ).toHaveCount(1, { timeout: 30_000 })
    await expect(panel.locator('tbody tr')).toHaveCount(2)
    // The node answered and agreed with the registry, so nothing is flagged.
    await expect(page.locator('main').getByText(UNVERIFIED)).toHaveCount(0)
    expect(indexed.length, 'the indexer was asked first').toBeGreaterThan(0)
    expect(
      node.count,
      'the mismatch sent the read to the node',
    ).toBeGreaterThan(0)
  })

  test("a grant the indexer hasn't caught up with is listed, with its edit control", async ({
    portalPage: page,
    wallet,
    makeName,
    wallets,
  }) => {
    await connectWithHeadlessWallet(page, wallet)
    const { name, owner, manager, resource, rows } = await nameWithManager(
      makeName,
      wallets,
      'roles-1484-short',
    )

    // The registration's grants are indexed; the manager's later grant isn't.
    await serveIndexedHistory(page, rowsFor(rows, owner))
    const node = await watchNodeRoleReads(page, resource)
    await page.goto(rolesPage(name))
    const panel = await panelSettled(page)

    // Positive control: the indexed holder is there, so the page loaded.
    await expect(panel.locator('tr', { hasText: truncate(owner) })).toHaveCount(
      1,
      { timeout: 30_000 },
    )
    const managerRow = panel.locator('tr', { hasText: truncate(manager) })
    await expect(
      managerRow,
      'pre-fix: a manager missing from the indexer was missing from the list',
    ).toHaveCount(1, { timeout: 30_000 })
    await expect(
      managerRow.getByText('Set Resolver', { exact: true }),
    ).toBeVisible()
    await expect(
      managerRow.getByRole('button', { name: 'Edit user roles' }),
      'the owner can act on the missing grant',
    ).toBeVisible()
    await expect(page.locator('main').getByText(UNVERIFIED)).toHaveCount(0)
    expect(node.count).toBeGreaterThan(0)
  })

  test('an empty indexed history with the node down shows a warning, never "No role holders yet"', async ({
    portalPage: page,
    makeName,
    wallets,
  }) => {
    const { name, resource } = await nameWithManager(
      makeName,
      wallets,
      'roles-1484-down',
    )

    await serveIndexedHistory(page, [])
    const node = await watchNodeRoleReads(page, resource, { fail: true })
    await page.goto(rolesPage(name))
    await panelSettled(page)

    await expect(
      page.locator('main').getByText('No role holders yet'),
      'pre-fix: the unverifiable empty list read as "nobody holds anything"',
    ).toHaveCount(0)
    await expect(page.locator('main').getByText(UNVERIFIED)).toBeVisible()
    // Nothing was found, so there is no table to show alongside the warning.
    await expect(rolesList(page).locator('tbody tr')).toHaveCount(0)
    expect(node.count, 'the node was asked, and failed').toBeGreaterThan(0)
  })

  test('a short indexed history with the node down is flagged on the roles, profile and ownership pages', async ({
    portalPage: page,
    makeName,
    wallets,
  }) => {
    const { name, owner, manager, resource, rows } = await nameWithManager(
      makeName,
      wallets,
      'roles-1484-flag',
    )

    await serveIndexedHistory(page, rowsFor(rows, owner))
    await watchNodeRoleReads(page, resource, { fail: true })

    // Roles: the warning, plus the holders that were found.
    await page.goto(rolesPage(name))
    const panel = await panelSettled(page)
    await expect(
      page.locator('main').getByText(UNVERIFIED),
      'pre-fix: a short list was shown as complete',
    ).toBeVisible()
    await expect(panel.locator('tr', { hasText: truncate(owner) })).toHaveCount(
      1,
    )

    // Profile: the counter can't claim a number it couldn't check.
    await page.goto(`${PORTAL_APP_URL}/${name}`)
    const counter = page
      .locator('main')
      .getByRole('link', { name: /Role holders/ })
    await expect(counter).toBeVisible({ timeout: 60_000 })
    await expect(
      counter,
      'pre-fix: the counter showed the short count (1)',
    ).toContainText('?', { timeout: 30_000 })

    // Ownership: the owner's own row isn't a third party's, so with nothing
    // else found the row says it couldn't check rather than vanishing.
    await page.goto(`${PORTAL_APP_URL}/${name}/ownership`)
    await expect(page.locator('main').getByText('Managers')).toBeVisible({
      timeout: 60_000,
    })
    await expect(
      page
        .locator('main')
        .getByText('Couldn’t check who else holds permissions on this name'),
      'pre-fix: no Managers row, hiding a live grant',
    ).toBeVisible()
    await expect(
      page.locator('main').getByText(truncate(manager)),
      'the manager the indexer missed is still unknown to the page',
    ).toHaveCount(0)
  })

  test('a live grant behind more than a page of role events is listed from the indexer, without the node', async ({
    portalPage: page,
    makeName,
    wallets,
  }) => {
    const { name, owner, manager, resource, rows } = await nameWithManager(
      makeName,
      wallets,
      'roles-1484-paged',
    )

    // A thousand older changes on the same resource, ahead of the real ones:
    // a throwaway account granted and revoked, two changes a block, ending
    // revoked. It holds nothing, so the registry agrees with the replay.
    const churner = privateKeyToAddress(generatePrivateKey()).toLowerCase()
    const resourceTopic = resourceHex(resource)
    const noise: IndexedRow[] = Array.from({ length: 1_000 }, (_, i) => ({
      id: `${keccak256(toHex(`web-1484-${churner}-${i >> 1}`))}-${i % 2}`,
      blockNumber: String(ROLES_FROM_BLOCK + BigInt(i >> 1)),
      timestamp: '1700000000',
      transactionHash: keccak256(toHex(`web-1484-${churner}-${i >> 1}`)),
      asEACRolesChanged: {
        resource: resourceTopic,
        account: churner as Address,
        oldRoleBitmap: i % 2 === 0 ? '0x0' : '0x1',
        newRoleBitmap: i % 2 === 0 ? '0x1' : '0x0',
      },
    }))
    const lastNoiseBlock = Number(ROLES_FROM_BLOCK) + 499

    const indexed = await serveIndexedHistory(page, [...noise, ...rows])
    const node = await watchNodeRoleReads(page, resource)
    await page.goto(rolesPage(name))
    const panel = await panelSettled(page)

    for (const account of [owner, manager])
      await expect(
        panel.locator('tr', { hasText: truncate(account) }),
      ).toHaveCount(1, { timeout: 30_000 })
    await expect(panel.locator('tbody tr')).toHaveCount(2)
    await expect(page.locator('main').getByText(UNVERIFIED)).toHaveCount(0)

    // The second page starts at the last block the first one read, so the
    // two rows straddling it are re-read and deduped rather than skipped.
    const pages = indexed.filter((r) => r.resource === resourceTopic)
    expect(
      pages.map((r) => r.fromBlock).slice(0, 2),
      'pre-fix: one full page and no second request',
    ).toEqual([Number(ROLES_FROM_BLOCK), lastNoiseBlock])
    expect(
      node.count,
      'pre-fix: a full first page went straight to the node scan',
    ).toBe(0)
  })

  test('the transfer form revokes a manager the indexer missed, and the transfer goes through', async ({
    portalPage: page,
    wallet,
    accounts,
    makeName,
    wallets,
  }) => {
    await connectWithHeadlessWallet(page, wallet)
    const { name, label, owner, manager, rows } = await nameWithManager(
      makeName,
      wallets,
      'roles-1484-xfer',
    )
    const recipient = accounts.getAddress('user4')

    await serveIndexedHistory(page, rowsFor(rows, owner))
    await page.goto(`${PORTAL_APP_URL}/${name}/ownership/transfer`)
    await expect(
      page.getByRole('heading', { name: 'Transfer ownership' }),
    ).toBeVisible({ timeout: 30_000 })
    await page.getByPlaceholder('ENS name or address').fill(recipient)

    await expect(
      page.getByRole('switch', { name: /Revoke everyone else’s permissions/ }),
      'pre-fix: no revoke step, and the transfer dead-ended at "The transfer itself would fail"',
    ).toBeChecked({ timeout: 30_000 })
    await expect(
      page.locator('main').getByText(truncate(manager)),
      'the revoke step names the manager',
    ).toBeVisible()
    const transferButton = page.getByRole('button', { name: 'Transfer name' })
    await expect(transferButton).toBeEnabled({ timeout: 30_000 })
    await transferButton.click()
    await driveTransactionsToSuccess(page, wallet, [
      `transfer-${name}-detach-resolver`,
      `transfer-${name}-revoke-roles-${manager.toLowerCase()}`,
      `transfer-${name}-transfer-token`,
    ])

    expect(
      (
        (await getOwner(publicClient as never, { name } as never)) as Address
      ).toLowerCase(),
      'the transfer landed',
    ).toBe(recipient.toLowerCase())
    expect(
      (await readNameRoles({ label }, manager)).decoded,
      'the manager holds nothing over the new owner’s name',
    ).toEqual([])
  })

  test("with the list unconfirmed, the transfer form won't build a plan that might miss someone", async ({
    portalPage: page,
    wallet,
    accounts,
    makeName,
    wallets,
  }) => {
    await connectWithHeadlessWallet(page, wallet)
    const { name, owner, resource, rows } = await nameWithManager(
      makeName,
      wallets,
      'roles-1484-xfer-down',
    )

    await serveIndexedHistory(page, rowsFor(rows, owner))
    await watchNodeRoleReads(page, resource, { fail: true })
    await page.goto(`${PORTAL_APP_URL}/${name}/ownership/transfer`)
    await expect(
      page.getByRole('heading', { name: 'Transfer ownership' }),
    ).toBeVisible({ timeout: 30_000 })
    await page
      .getByPlaceholder('ENS name or address')
      .fill(accounts.getAddress('user4'))

    await expect(
      page
        .locator('main')
        .getByText('Couldn’t check who else holds permissions on this name'),
      'pre-fix: the short list was planned from as if complete',
    ).toBeVisible({ timeout: 30_000 })
    await expect(
      page.getByRole('button', { name: 'Transfer name' }),
    ).toBeDisabled()
  })

  test('guard: a complete indexed history is verified without the node', async ({
    portalPage: page,
    makeName,
    wallets,
  }) => {
    const { name, owner, manager, resource, rows } = await nameWithManager(
      makeName,
      wallets,
      'roles-1484-guard',
    )

    await serveIndexedHistory(page, rows)
    const node = await watchNodeRoleReads(page, resource)
    await page.goto(rolesPage(name))
    const panel = await panelSettled(page)

    for (const account of [owner, manager])
      await expect(
        panel.locator('tr', { hasText: truncate(account) }),
      ).toHaveCount(1, { timeout: 30_000 })
    await expect(page.locator('main').getByText(UNVERIFIED)).toHaveCount(0)
    expect(node.count, 'a matching replay never reaches the node').toBe(0)
  })
})
