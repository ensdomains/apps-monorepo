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

import { getName } from '@ensdomains/ensjs/public'
import { getOwner } from '@ensdomains/ensjs/public/v2'
import { labelToCanonicalId } from '@ensdomains/ensjs/utils/v2'
import { permissionedRegistryGetStateSnippet } from '@ensdomains/ensjs-abi/v2/permissionedRegistry'
import type { Web3ProviderBackend } from '@ensdomains/headless-web3-provider'
import type { Page } from '@playwright/test'
import {
  type Account,
  type Address,
  encodeFunctionData,
  type Hex,
  parseAbi,
  parseAbiItem,
  toHex,
  zeroAddress,
} from 'viem'
import { generatePrivateKey, privateKeyToAddress } from 'viem/accounts'
import { createMakeV1Name } from '../../../fixtures/makeV1Name.js'
import {
  connectWithHeadlessWallet,
  expect,
  test,
} from '../../../fixtures/playwright.portal.fixture.js'
import { publicClient, walletClient } from '../../../helpers/anvil-client.js'
import { waitForBignameBlock } from '../../../helpers/bigname-sync.js'
import {
  waitForIndexedBlock,
  waitForIndexedRoles,
} from '../../../helpers/indexer-sync.js'
import { authorizeTransaction } from '../../../helpers/portal-auth.js'
import {
  accountHasRoles,
  assertRoleBitmap,
  ETH_REGISTRY,
  grantNameRoles,
  readNameRoles,
  readRoleHolders,
} from '../../../helpers/role-assertions.js'
import {
  driveTransactionsToSuccess,
  PORTAL_TRANSACTION_IDS,
} from '../../../helpers/transaction-modal.js'

const PORTAL_APP_URL = process.env.PORTAL_APP_URL ?? 'http://localhost:3001'

/**
 * A read of one registration's role history from bigname: its permission
 * events (`/v1/events?registration_id=…&type=permission`), which the explorer
 * reads since #1354 before falling back to the node's logs.
 */
const isBignameRoleRead = (raw: string) => {
  if (!raw.includes('/v1/events')) return false
  const url = new URL(raw)
  return (
    url.pathname.endsWith('/v1/events') &&
    url.searchParams.has('registration_id') &&
    url.searchParams
      .getAll('type')
      .flatMap((t) => t.split(','))
      .includes('permission')
  )
}

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
 * The roles table is indexer-backed, so it can only be asserted once bigname
 * holds the role events for every account the assertion names. Without this
 * the page renders its empty state — or a partial one — and caches it. See
 * `helpers/indexer-sync.ts`.
 */
const awaitIndexed = (label: string, accounts: Address[]) =>
  waitForIndexedRoles(ETH_REGISTRY, labelToCanonicalId(label), accounts)

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
 * One local-stack workaround, which does not change what the app reads:
 * Anvil forwards the pre-fork part of that `eth_getLogs` upstream. When the
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
    // With the explorer on bigname (#1354) a name's role history is its
    // registration's permission events; the node is only the fallback.
    if (isBignameRoleRead(response.url())) {
      if (response.ok()) tally.clean++
      else tally.degraded++
      return tally
    }
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

  // A name the explorer's indexer hasn't seen reads as unindexed, which
  // sends the page to the node instead (and bigname indexes a fresh name a
  // few blocks behind the chain).
  const gotoWithCleanRoleRead = async (page: Page, url: string) => {
    await waitForIndexedBlock()
    return navigateWithCleanRoleRead(page, () => page.goto(url), url)
  }

  /**
   * Badge absence is only meaningful once the role read has landed and the
   * page has had time to render from it: the positive tests render the same
   * badge from the same read well inside this window.
   */
  const RENDER_SETTLE_MS = 2_000

  const badge = (page: Page, label: string) =>
    page.locator('main').getByRole('button', { name: label, exact: true })

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

  /** Move the chain (and the page clock) to one day past `label`'s expiry. */
  /** Every privilege warning this PR can render, scoped to `main`. */
  /**
   * The tab body that loaded: either the tab itself (its owner row or its
   * heading row) or the "not registered" placeholder the routes show for a
   * name in grace. Either way, the page has finished deciding what to render.
   */
  /** Open `tab` from the name's sidebar, without a page load. */
  /**
   * Renew `name` through the portal's own Extend modal on its profile page,
   * as an owner in grace would. The registrar allowance is zeroed first so the
   * flow is always approve, then renew.
   */
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
 * Each test serves the name's bigname permission events itself, from the real
 * answer, with rows dropped or padded to make the history the bug needs. The
 * served rows page the way bigname does, by cursor. Every oracle is the chain.
 */
test.describe('Portal name roles — role holders checked against the registry (WEB-1484)', () => {
  test.describe.configure({ timeout: 300_000 })

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

  /** One bigname event row (`/v1/events`), as the explorer reads it. */
  type BignameEventRow = {
    readonly type: string
    readonly block_number: number | null
    readonly timestamp: string
    readonly transaction_hash: string | null
    readonly log_index: number
    readonly contract_address: string | null
    readonly data?: {
      readonly address?: string
      readonly powers?: readonly string[]
      readonly [key: string]: unknown
    }
    readonly [key: string]: unknown
  }

  /** Rows granted to or revoked from `account`. */
  const rowsOf = (account: Address) => (rows: readonly BignameEventRow[]) =>
    rows.filter(
      (row) => row.data?.address?.toLowerCase() === account.toLowerCase(),
    )

  /** Every page of bigname's real answer to a role-history request. */
  async function readRealHistory(
    route: import('@playwright/test').Route,
    url: URL,
  ): Promise<BignameEventRow[]> {
    const real: BignameEventRow[] = []
    const all = new URL(url)
    all.searchParams.delete('cursor')
    let next: string | null = null
    do {
      if (next) all.searchParams.set('cursor', next)
      const response = await route.fetch({ url: all.toString() })
      const body = (await response.json()) as {
        data?: BignameEventRow[]
        page?: { next_cursor?: string | null; has_more?: boolean }
      }
      real.push(...(body.data ?? []))
      next = body.page?.has_more ? (body.page.next_cursor ?? null) : null
    } while (next)
    return real
  }

  /**
   * Serves the name's role history — bigname's permission events for its
   * registration (`/v1/events?registration_id=…&type=permission`, which the
   * explorer reads since #1354) — as `select` makes it from the real answer:
   * dropped, filtered or padded. Paged by cursor the way bigname pages, at
   * the request's `page_size`. Records each request.
   */
  async function serveIndexedHistory(
    page: Page,
    select: (real: readonly BignameEventRow[]) => readonly BignameEventRow[],
  ) {
    const requests: { cursor: string | null; pageSize: number }[] = []
    let served: readonly BignameEventRow[] | null = null
    await page.route(
      (url) => isBignameRoleRead(url.toString()),
      async (route) => {
        const url = new URL(route.request().url())
        const pageSize = Number(url.searchParams.get('page_size') ?? 100)
        const cursor = url.searchParams.get('cursor')
        requests.push({ cursor, pageSize })
        served ??= select(await readRealHistory(route, url))
        const offset = cursor ? Number(cursor) : 0
        const slice = served.slice(offset, offset + pageSize)
        const end = offset + slice.length
        const hasMore = end < served.length
        return route.fulfill({
          contentType: 'application/json',
          body: JSON.stringify({
            data: slice,
            page: {
              cursor: cursor ?? null,
              next_cursor: hasMore ? String(end) : null,
              page_size: pageSize,
              total_count: served.length,
              has_more: hasMore,
            },
            meta: {},
          }),
        })
      },
    )
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
    // The explorer reads the name's registration from bigname before its
    // role history, so the name — grant included — must be indexed first.
    await waitForBignameBlock()
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

    await serveIndexedHistory(page, () => [])
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

  test('the transfer form revokes a manager the indexer missed, and the transfer goes through', async ({
    portalPage: page,
    wallet,
    accounts,
    makeName,
    wallets,
  }) => {
    await connectWithHeadlessWallet(page, wallet)
    const { name, label, owner, manager } = await nameWithManager(
      makeName,
      wallets,
      'roles-1484-xfer',
    )
    const recipient = accounts.getAddress('user4')

    await serveIndexedHistory(page, rowsOf(owner))
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
    const { name, owner, resource } = await nameWithManager(
      makeName,
      wallets,
      'roles-1484-xfer-down',
    )

    await serveIndexedHistory(page, rowsOf(owner))
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
})
