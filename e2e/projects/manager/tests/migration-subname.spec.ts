/**
 * ENS V1 → V2 subname migration E2E tests.
 *
 * Subnames do NOT migrate the way 2LDs do. The subname-migration PR added a
 * second action alongside `migrate`:
 *
 *   action: 'migrate'  the V1 token is transferred to a V2 receiver
 *   action: 'copy'     there is no transferable token, so the name is
 *                      RE-CREATED in V2 inside a deterministic `UserRegistry`
 *                      deployed for its parent
 *
 * Two shapes copy:
 *
 *   registry-child   a subname owned directly in the legacy registry, with no
 *                    NameWrapper token at all. Copied with expiry MAX_UINT64,
 *                    because it has no expiry of its own in V1.
 *   unlocked-child   a NameWrapper subname without CANNOT_UNWRAP, under a
 *                    parent that is not locked. Carries its wrapper expiry.
 *
 * The rule that governs all of it is `hasCompleteCopyRoute`: a copy survives
 * classification only if walking up its ancestry reaches a name that is being
 * migrated directly AND is an `unwrapped` or `unlocked` .eth 2LD. So:
 *
 *   - a copy is never offered without its parent,
 *   - a child of a LOCKED 2LD is not a copy at all — it stays on the old
 *     `locked-child` / `detached-child` WrapperRegistry token route.
 *
 * Prerequisites:
 *   - Anvil fork running with V1 + V2 contracts
 *   - Manager app running with Rhinestone enabled
 */
import { privateKeyToAccount } from 'viem/accounts'

import { createMakeV1Name } from '../../../fixtures/makeV1Name.js'
import { makeV1RegistrySubname } from '../../../fixtures/makeV1RegistrySubname.js'
import {
  CHILD_FUSES,
  makeV1Subname,
  readWrapperExpiry,
} from '../../../fixtures/makeV1Subname.js'
import { expect, test } from '../../../fixtures/playwright.manager.fixture.js'
import {
  assertCopyExpiry,
  assertCopyRegistered,
  assertLockedMigration,
  assertNotUserRegistry,
  assertUserRegistryAttached,
  assertV2Registered,
  MAX_UINT64,
} from '../../../helpers/migration-assertions.js'
import {
  nestedRow,
  openMigrationFlow,
  rootRow,
  runMigrationFlow,
} from '../../../helpers/migration-flow.js'
import {
  type MockV1Tree,
  mockV1Subgraph,
} from '../../../helpers/mock-v1-subgraph.js'

// Headless wallet user = Anvil account 0 (same private key as ANVIL_FUNDER)
const HEADLESS_USER_ADDRESS = privateKeyToAccount(
  '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
).address

/**
 * A resolver that is NOT in `KNOWN_PUBLIC_RESOLVERS`. Copies whose V1 resolver
 * is unrecognised are ineligible with `unsupported-resolver`, because the copy
 * always rewrites the resolver to the owner's PermissionedResolver and cannot
 * carry an unknown one across. Any non-allowlisted address works — this one is
 * deliberately not a deployed contract, since classification never calls it.
 */
const UNRECOGNISED_RESOLVER = '0x00000000000000000000000000000000deadbe11'

const labelOf = (fullName: string) => fullName.split('.')[0]
/**
 * Every negative test here asserts a name is ABSENT from the selection list,
 * which is the weakest oracle in the suite: it passes just as happily when the
 * subgraph mock never fired at all. So each one injects a control 2LD that
 * MUST appear, and asserts the control first. Without that, "the mock is
 * broken" and "the product correctly rejected this name" are indistinguishable.
 */
async function expectOfferedAndAbsent(
  page: import('@playwright/test').Page,
  options: { readonly control: string; readonly absent: readonly string[] },
) {
  await expect(
    rootRow(page, options.control),
    `control name ${options.control} is missing — the subgraph mock did not reach the app, ` +
      `so the absence assertions below would pass vacuously`,
  ).toBeVisible({ timeout: 30_000 })

  for (const name of options.absent) {
    await expect(
      page.getByTitle(name, { exact: true }),
      `expected ${name} to be ineligible and not offered`,
    ).toHaveCount(0)
  }
}

test.describe('ENS V1 → V2 subname migration', () => {
  test.describe.configure({ timeout: 300_000 })

  // -------------------------------------------------------------------------
  // Copy: registry-child
  // -------------------------------------------------------------------------

  test('copies a registry-only subname into a UserRegistry under its parent', {
    tag: ['@scenario:GS4'],
  }, async ({ migrationConnectedPage: page, wallet, accounts }) => {
    const userAccount = privateKeyToAccount(accounts.getPrivateKey('user'))
    const makeV1Name = createMakeV1Name({ userAccount })

    // The parent must be UNWRAPPED: a wrapped parent's registry owner is the
    // NameWrapper, so the EOA could not create a registry-only child under it —
    // and the child would have a wrapper token, which is a different route.
    const parent = await makeV1Name({ label: 'migcopyreg' })
    const child = await makeV1RegistrySubname({
      parentName: parent.replace(/\.eth$/, ''),
      childLabel: 'sub',
      ownerAddress: HEADLESS_USER_ADDRESS,
      parentOwnerAccount: userAccount,
    })

    const tree: MockV1Tree = {
      ownerAddress: HEADLESS_USER_ADDRESS,
      roots: [
        {
          kind: 'registration',
          label: labelOf(parent),
          children: [{ kind: 'registry-child', label: 'sub' }],
        },
      ],
    }
    await mockV1Subgraph(page, tree)

    await openMigrationFlow(page)
    // The parent is selectable; the child rides along and is not.
    await expect(rootRow(page, parent)).toBeVisible({ timeout: 30_000 })
    await expect(nestedRow(page, child)).toBeVisible()
    await expect(
      page.getByRole('button', { name: child, exact: true }),
      'a subname must not be independently selectable',
    ).toHaveCount(0)

    await runMigrationFlow(page, wallet)

    // The 2LD migrated as a token…
    await assertV2Registered(labelOf(parent))
    // …and the child was re-created inside a factory-certified UserRegistry.
    await assertUserRegistryAttached(parent)
    await assertCopyRegistered(child, HEADLESS_USER_ADDRESS)
    // A registry-only child has no V1 expiry of its own, so it copies with the
    // sentinel. This is the check that tells the two copy sources apart.
    await assertCopyExpiry(child, MAX_UINT64)
  })

  // -------------------------------------------------------------------------
  // Copy: unlocked-child
  // -------------------------------------------------------------------------

  test('copies an unlocked NameWrapper subname, carrying its wrapper expiry', {
    tag: ['@scenario:GS3'],
  }, async ({ migrationConnectedPage: page, wallet, accounts }) => {
    const userAccount = privateKeyToAccount(accounts.getPrivateKey('user'))
    const makeV1Name = createMakeV1Name({ userAccount })

    // Wrapped but NOT locked. A locked parent would put the child on the
    // detached-child/locked-child token route instead of the copy route.
    const parent = await makeV1Name({ label: 'migcopywrap', type: 'wrapped' })
    const childExpiry = BigInt(Math.floor(Date.now() / 1000) + 180 * 24 * 3600)
    const child = await makeV1Subname({
      parentName: parent.replace(/\.eth$/, ''),
      childLabel: 'sub',
      ownerAddress: HEADLESS_USER_ADDRESS,
      parentOwnerAccount: userAccount,
      // No fuses at all. PARENT_CANNOT_CONTROL cannot be burned here anyway —
      // the NameWrapper requires the parent to have CANNOT_UNWRAP first.
      fuses: CHILD_FUSES.UNLOCKED_CHILD,
      expiry: childExpiry,
    })

    // Read both wrapper expiries off chain rather than computing them. The app
    // re-reads the parent's before planning a copy and compares it EXACTLY with
    // what the subgraph reported — and a wrapped 2LD's wrapper expiry is the
    // registrar expiry plus a 90-day grace period, off a block timestamp we do
    // not control. Guessing it fails the whole migration with
    // `source-expiry-changed`, visible only as "Gas estimate unavailable".
    const parentWrapperExpiry = await readWrapperExpiry(parent)
    const childWrapperExpiry = await readWrapperExpiry(child)

    await mockV1Subgraph(page, {
      ownerAddress: HEADLESS_USER_ADDRESS,
      roots: [
        {
          kind: 'registration',
          label: labelOf(parent),
          type: 'wrapped',
          wrapperExpiry: Number(parentWrapperExpiry),
          children: [
            {
              kind: 'wrapped-child',
              label: 'sub',
              fuses: CHILD_FUSES.UNLOCKED_CHILD,
              expiryDate: Number(childWrapperExpiry),
            },
          ],
        },
      ],
    })

    await runMigrationFlow(page, wallet)

    await assertV2Registered(labelOf(parent))
    await assertUserRegistryAttached(parent)
    await assertCopyRegistered(child, HEADLESS_USER_ADDRESS)
    // Unlike a registry child, this one carries its own wrapper expiry across.
    await assertCopyExpiry(child, childWrapperExpiry)
  })

  // -------------------------------------------------------------------------
  // Nested copies
  // -------------------------------------------------------------------------

  test('copies a three-level chain, deploying a UserRegistry at each level', {
    tag: ['@scenario:GS14'],
  }, async ({ migrationConnectedPage: page, wallet, accounts }) => {
    const userAccount = privateKeyToAccount(accounts.getPrivateKey('user'))
    const makeV1Name = createMakeV1Name({ userAccount })

    const parent = await makeV1Name({ label: 'mignested' })
    const parentLabel = parent.replace(/\.eth$/, '')
    const child = await makeV1RegistrySubname({
      parentName: parentLabel,
      childLabel: 'sub',
      ownerAddress: HEADLESS_USER_ADDRESS,
      parentOwnerAccount: userAccount,
    })
    const grandchild = await makeV1RegistrySubname({
      parentName: `sub.${parentLabel}`,
      childLabel: 'deep',
      ownerAddress: HEADLESS_USER_ADDRESS,
      parentOwnerAccount: userAccount,
    })

    await mockV1Subgraph(page, {
      ownerAddress: HEADLESS_USER_ADDRESS,
      roots: [
        {
          kind: 'registration',
          label: labelOf(parent),
          children: [
            {
              kind: 'registry-child',
              label: 'sub',
              children: [{ kind: 'registry-child', label: 'deep' }],
            },
          ],
        },
      ],
    })

    await openMigrationFlow(page)
    // The tree renders recursively: one selectable root, two passengers.
    await expect(rootRow(page, parent)).toBeVisible({ timeout: 30_000 })
    await expect(nestedRow(page, child)).toBeVisible()
    await expect(nestedRow(page, grandchild)).toBeVisible()

    await runMigrationFlow(page, wallet)

    await assertV2Registered(labelOf(parent))
    // Two chained registries: one hanging off .eth for the 2LD, one hanging off
    // THAT for the 3LD. `assertUserRegistryAttached` walks the path to find it,
    // so this fails if either link is missing.
    await assertUserRegistryAttached(parent)
    await assertUserRegistryAttached(child)
    await assertCopyRegistered(child, HEADLESS_USER_ADDRESS)
    await assertCopyRegistered(grandchild, HEADLESS_USER_ADDRESS)
  })

  // -------------------------------------------------------------------------
  // Selection semantics
  // -------------------------------------------------------------------------

  test('a subname follows its root selection and cannot be toggled alone', {
    tag: ['@scenario:GS7'],
  }, async ({ migrationConnectedPage: page, accounts }) => {
    const userAccount = privateKeyToAccount(accounts.getPrivateKey('user'))
    const makeV1Name = createMakeV1Name({ userAccount })

    const parent = await makeV1Name({ label: 'migselect' })
    const other = await makeV1Name({ label: 'migselect-other' })
    const child = await makeV1RegistrySubname({
      parentName: parent.replace(/\.eth$/, ''),
      childLabel: 'sub',
      ownerAddress: HEADLESS_USER_ADDRESS,
      parentOwnerAccount: userAccount,
    })

    await mockV1Subgraph(page, {
      ownerAddress: HEADLESS_USER_ADDRESS,
      roots: [
        {
          kind: 'registration',
          label: labelOf(parent),
          children: [{ kind: 'registry-child', label: 'sub' }],
        },
        { kind: 'registration', label: labelOf(other) },
      ],
    })

    await openMigrationFlow(page)

    const parentRow = rootRow(page, parent)
    await expect(parentRow).toBeVisible({ timeout: 30_000 })
    await expect(parentRow).toHaveAttribute('aria-pressed', 'true')
    await expect(nestedRow(page, child)).toBeVisible()

    // The child is a passenger: no button, so nothing to click.
    await expect(
      page.getByRole('button', { name: child, exact: true }),
    ).toHaveCount(0)

    // Deselecting the root takes the whole subtree with it, and leaves the
    // unrelated 2LD alone.
    await parentRow.click()
    await expect(parentRow).toHaveAttribute('aria-pressed', 'false')
    await expect(rootRow(page, other)).toHaveAttribute('aria-pressed', 'true')

    // Reselecting restores it.
    await parentRow.click()
    await expect(parentRow).toHaveAttribute('aria-pressed', 'true')
  })

  // -------------------------------------------------------------------------
  // Ineligible copies
  // -------------------------------------------------------------------------

  test('does not offer a subname whose parent is not being migrated', {
    tag: ['@scenario:GS9'],
  }, async ({ migrationConnectedPage: page, accounts }) => {
    const userAccount = privateKeyToAccount(accounts.getPrivateKey('user'))
    const makeV1Name = createMakeV1Name({ userAccount })

    const parent = await makeV1Name({ label: 'migorphan' })
    const control = await makeV1Name({ label: 'migorphan-control' })
    const child = await makeV1RegistrySubname({
      parentName: parent.replace(/\.eth$/, ''),
      childLabel: 'sub',
      ownerAddress: HEADLESS_USER_ADDRESS,
      parentOwnerAccount: userAccount,
    })

    // The child is injected as a ROOT hanging off its real parent, but that
    // parent is deliberately absent from the injection — exactly the shape of a
    // wallet that owns a subname but not the 2LD above it. `hasCompleteCopyRoute`
    // walks up, finds no classified ancestor, and demotes it to `missing-parent`.
    await mockV1Subgraph(page, {
      ownerAddress: HEADLESS_USER_ADDRESS,
      roots: [
        { kind: 'registration', label: labelOf(control) },
        { kind: 'registry-child', label: 'sub', parentName: parent },
      ],
    })

    await openMigrationFlow(page)
    await expectOfferedAndAbsent(page, { control, absent: [child] })
  })

  test('does not copy a subname under a LOCKED 2LD — that stays a token migration', {
    tag: ['@scenario:GS15'],
  }, async ({ migrationConnectedPage: page, wallet, accounts }) => {
    const userAccount = privateKeyToAccount(accounts.getPrivateKey('user'))
    const makeV1Name = createMakeV1Name({ userAccount })

    // A locked 2LD with an emancipated child is `detached-child`: a real token
    // migration through the parent's WrapperRegistry, not a copy. This is the
    // regression guard that the copy path did not swallow the token path.
    const parent = await makeV1Name({ label: 'miglockedsub', type: 'locked' })
    const child = await makeV1Subname({
      parentName: parent.replace(/\.eth$/, ''),
      childLabel: 'sub',
      ownerAddress: HEADLESS_USER_ADDRESS,
      parentOwnerAccount: userAccount,
      fuses: CHILD_FUSES.LOCKED_CHILD,
    })

    await mockV1Subgraph(page, {
      ownerAddress: HEADLESS_USER_ADDRESS,
      roots: [
        {
          kind: 'registration',
          label: labelOf(parent),
          type: 'locked',
          children: [
            {
              kind: 'wrapped-child',
              label: 'sub',
              fuses: CHILD_FUSES.LOCKED_CHILD,
            },
          ],
        },
      ],
    })

    await openMigrationFlow(page)
    // The child IS offered — it is eligible, just via the token route.
    await expect(rootRow(page, parent)).toBeVisible({ timeout: 30_000 })
    await expect(nestedRow(page, child)).toBeVisible()

    await runMigrationFlow(page, wallet)

    // Both routes leave a non-zero subregistry, so "has a subregistry" cannot
    // tell them apart. The factory's implementation pointer can: this must be
    // a WrapperRegistry and must NOT be a UserRegistry.
    await assertLockedMigration(labelOf(parent))
    await assertNotUserRegistry(parent)
  })

  test('does not offer a copy whose V1 resolver is not a known public resolver', {
    tag: ['@scenario:GS16'],
  }, async ({ migrationConnectedPage: page, accounts }) => {
    const userAccount = privateKeyToAccount(accounts.getPrivateKey('user'))
    const makeV1Name = createMakeV1Name({ userAccount })

    const parent = await makeV1Name({ label: 'migbadres' })
    const parentLabel = parent.replace(/\.eth$/, '')
    const rejected = await makeV1RegistrySubname({
      parentName: parentLabel,
      childLabel: 'bad',
      ownerAddress: HEADLESS_USER_ADDRESS,
      parentOwnerAccount: userAccount,
      resolver: UNRECOGNISED_RESOLVER,
    })
    const accepted = await makeV1RegistrySubname({
      parentName: parentLabel,
      childLabel: 'good',
      ownerAddress: HEADLESS_USER_ADDRESS,
      parentOwnerAccount: userAccount,
    })

    await mockV1Subgraph(page, {
      ownerAddress: HEADLESS_USER_ADDRESS,
      roots: [
        {
          kind: 'registration',
          label: labelOf(parent),
          children: [
            {
              kind: 'registry-child',
              label: 'bad',
              resolver: UNRECOGNISED_RESOLVER,
            },
            { kind: 'registry-child', label: 'good' },
          ],
        },
      ],
    })

    await openMigrationFlow(page)
    // The sibling with no resolver is the control: it proves the mock fired and
    // that the parent is migrating, so the rejection below is about the
    // resolver and nothing else.
    await expect(nestedRow(page, accepted)).toBeVisible({ timeout: 30_000 })
    await expect(
      page.getByTitle(rejected, { exact: true }),
      `${rejected} has an unrecognised V1 resolver and must be ineligible`,
    ).toHaveCount(0)
  })
})
