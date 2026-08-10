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
import type { Address } from 'viem'
import {
  connectWithHeadlessWallet,
  expect,
  test,
} from '../../../fixtures/playwright.portal.fixture.js'
import { waitForIndexedRoles } from '../../../helpers/indexer-sync.js'
import {
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
})
