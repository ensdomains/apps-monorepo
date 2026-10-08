/**
 * What the portal offers the owner of a migrated locked 2LD, by V1 fuse (§G.GW).
 *
 * The roles a locked name carries into V2 are derived from its V1 fuses
 * (`LockedWrapperReceiver`); `migration-fuses.spec.ts` asserts those bitmaps
 * after a UI-driven migration in the manager. GW8 also requires the portal to
 * honour them, which is this file:
 *
 *   GW8  CANNOT_CREATE_SUBDOMAIN  no ROLE_REGISTRAR on the WrapperRegistry → no
 *                                 "Create subname"
 *
 * GW7 (CANNOT_BURN_FUSES → no role grant/revoke) is parked: the portal offers
 * "Add user" to any admin-role holder, and ROLE_CAN_TRANSFER_ADMIN survives a
 * freeze, so whether it should hide is a product question (handoff 2026-10-08).
 *
 * Seeded with `makeMigratedName`, which migrates through the real
 * `MigrationHelper` entrypoint, so the on-chain state is the state the manager
 * produces. Each test re-asserts the bitmap it depends on, then checks the
 * portal against a plain locked name owned by the same wallet: without that
 * positive control, "the button is absent" would pass just as well if the
 * portal never offered it to anyone.
 *
 * The root roles on a WrapperRegistry are granted to the .eth registry, and
 * `WrapperRegistry._getRoles` lends them to the parent name's owner — which is
 * why the owner of a plain migrated locked name is offered "Create subname".
 */
import { registryRoles } from '@ensdomains/ensjs/utils/v2'
import { FUSES } from '../../../fixtures/makeV1Name.js'
import {
  connectWithHeadlessWallet,
  expect,
  test,
} from '../../../fixtures/playwright.portal.fixture.js'
import { waitForIndexedBlock } from '../../../helpers/indexer-sync.js'
import { readLockedMigrationRoles } from '../../../helpers/migration-assertions.js'

const PORTAL_APP_URL = process.env.PORTAL_APP_URL ?? 'http://localhost:3001'

const {
  ROLE_CAN_TRANSFER_ADMIN,
  ROLE_REGISTRAR,
  ROLE_RENEW,
  ROLE_SET_RESOLVER,
  ROLE_SET_RESOLVER_ADMIN,
  ROLE_UPGRADE,
  ROLE_WAS_RESERVED,
} = registryRoles

/** `RegistryRolesLib.ROLE_CAN_NAME`; not exported by ensjs. */
const ROLE_CAN_NAME = 1n << 120n
const ADMIN_SHIFT = 128n
const ROOT_USER = ROLE_REGISTRAR | ROLE_RENEW | ROLE_UPGRADE | ROLE_CAN_NAME

const hex = (bitmap: bigint) => `0x${bitmap.toString(16)}`
const labelOf = (name: string) => name.replace(/\.eth$/, '')

async function expectRoles(
  name: string,
  expected: { token: bigint; root: bigint },
) {
  const { tokenRoles, rootRoles } = await readLockedMigrationRoles(
    labelOf(name),
  )
  // ROLE_WAS_RESERVED: every migrated token is registered out of RESERVED.
  expect(hex(tokenRoles), `token roles on ${name}`).toBe(
    hex(expected.token | ROLE_WAS_RESERVED),
  )
  expect(hex(rootRoles), `root roles on ${name}'s WrapperRegistry`).toBe(
    hex(expected.root),
  )
}

test.describe('Portal — migrated locked 2LDs honour their V1 fuses (§G.GW)', () => {
  test.describe.configure({ timeout: 300_000 })

  test('CANNOT_CREATE_SUBDOMAIN: the WrapperRegistry grants no ROLE_REGISTRAR, and "Create subname" is not offered', {
    tag: ['@scenario:GW8'],
  }, async ({ portalPage: page, wallet, makeMigratedName }) => {
    await connectWithHeadlessWallet(page, wallet)

    const control = await makeMigratedName({
      label: 'gw8-control',
      type: 'locked',
    })
    const closed = await makeMigratedName({
      label: 'gw8-no-subdomain',
      type: 'locked',
      fuses: FUSES.CANNOT_CREATE_SUBDOMAIN,
    })

    const rootUser = ROOT_USER & ~ROLE_REGISTRAR
    await expectRoles(closed, {
      token:
        ROLE_SET_RESOLVER | ROLE_SET_RESOLVER_ADMIN | ROLE_CAN_TRANSFER_ADMIN,
      root: rootUser | (rootUser << ADMIN_SHIFT),
    })

    await waitForIndexedBlock()

    await page.goto(`${PORTAL_APP_URL}/${control}/subnames`)
    await expect(
      page.getByRole('link', { name: 'Create subname' }),
      'the owner of a plain migrated locked name must be offered "Create subname"',
    ).toBeVisible({ timeout: 30_000 })

    await page.goto(`${PORTAL_APP_URL}/${closed}/subnames`)
    await expect(
      page.getByRole('heading', { name: closed }).first(),
    ).toBeVisible({ timeout: 30_000 })
    await expect(
      page.getByRole('link', { name: 'Create subname' }),
      'a name with CANNOT_CREATE_SUBDOMAIN must not be offered "Create subname"',
    ).toHaveCount(0, { timeout: 30_000 })
  })
})
