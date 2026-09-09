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

import { labelToCanonicalId } from '@ensdomains/ensjs/utils/v2'
import {
  grantRolesWriteParameters,
  revokeRolesWriteParameters,
} from '@ensdomains/ensjs/wallet/v2'
import {
  type Account,
  type Address,
  encodeFunctionData,
  type Hash,
  parseAbi,
} from 'viem'
import { createMakeV1Name } from '../../../fixtures/makeV1Name.js'
import {
  connectWithHeadlessWallet,
  expect,
  test,
} from '../../../fixtures/playwright.portal.fixture.js'
import { publicClient, walletClient } from '../../../helpers/anvil-client.js'
import { waitForIndexedRoles } from '../../../helpers/indexer-sync.js'
import {
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
 * The "parent registry roles" table — the one §5.C is about.
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
    .locator('h3', { hasText: 'parent registry roles' })
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
    tag: ['@scenario:C2'],
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
