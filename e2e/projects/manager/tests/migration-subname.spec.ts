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
import { ensL1Contracts, supportedL1Chains } from '@ensdomains/ensjs/chain'
import { Web3RequestKind } from '@ensdomains/headless-web3-provider'
import {
  type Address,
  concatHex,
  encodeAbiParameters,
  getContractAddress,
  type Hex,
  keccak256,
  labelhash,
  namehash as namehashOf,
  parseAbi,
  stringToHex,
} from 'viem'
import { privateKeyToAccount } from 'viem/accounts'

import {
  createMakeV1Name,
  V1_PUBLIC_RESOLVER,
} from '../../../fixtures/makeV1Name.js'
import { makeV1RegistrySubname } from '../../../fixtures/makeV1RegistrySubname.js'
import {
  CHILD_FUSES,
  makeV1Subname,
  readWrapperExpiry,
  wrapAndEmancipateRegistryChild,
  wrapV1SubnameOfUnwrapped,
} from '../../../fixtures/makeV1Subname.js'
import { expect, test } from '../../../fixtures/playwright.manager.fixture.js'
import { setV1RecordsOn, type V1Records } from '../../../fixtures/v1-records.js'
import { publicClient, testClient } from '../../../helpers/anvil-client.js'
import {
  isRealBigname,
  waitForBignameBlock,
} from '../../../helpers/bigname-sync.js'
import {
  assertCopyExpiry,
  assertCopyRegistered,
  assertLockedMigration,
  assertNotInV2,
  assertNotUserRegistry,
  assertUserRegistryAttached,
  assertV2Registered,
  assertWrappedChildMigrated,
  firstRegistrationPosition,
  MAX_UINT64,
  readV2NameStatus,
} from '../../../helpers/migration-assertions.js'
import {
  anyRow,
  confirmAndAuthorize,
  nestedRow,
  openMigrationFlow,
  readPlan,
  rootRow,
  runMigrationFlow,
  selectOnlyRoots,
} from '../../../helpers/migration-flow.js'
import type { PortalAccounts } from '../../../helpers/portal-auth.js'
import {
  expectRecordsResolve,
  resolverFor,
} from '../../../helpers/resolve-records.js'
import type { MockV1Tree } from '../../../helpers/v1-name-tree.js'
import { serveV1Names } from '../../../helpers/v1-names.js'

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
    await serveV1Names(page, tree)

    await openMigrationFlow(page)
    // The parent is selectable; the child rides along and is not.
    await expect(rootRow(page, parent)).toBeVisible({ timeout: 30_000 })
    await expect(nestedRow(page, child)).toBeVisible()
    await expect(
      page.getByRole('button', { name: child, exact: true }),
      'a subname must not be independently selectable',
    ).toHaveCount(0)

    await runMigrationFlow(page, wallet, { roots: [parent] })

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
    // From the chain's clock, never the runner's: the suite moves the fork
    // months ahead, so `Date.now() + 180 days` lands in the chain's past and the
    // copy reverts `CannotSetPastExpiry`.
    const { timestamp: chainNow } = await publicClient.getBlock()
    const childExpiry = chainNow + 180n * 24n * 3600n
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

    await serveV1Names(page, {
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

    await runMigrationFlow(page, wallet, { roots: [parent] })

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

    await serveV1Names(page, {
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

    await runMigrationFlow(page, wallet, { roots: [parent] })

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

    await serveV1Names(page, {
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
    await expect(parentRow).toBeChecked()
    await expect(nestedRow(page, child)).toBeVisible()

    // The child is a passenger: no checkbox, so nothing to toggle.
    await expect(rootRow(page, child)).toHaveCount(0)

    // Deselecting the root takes the whole subtree with it, and leaves the
    // unrelated 2LD alone. The input is visually hidden; its label takes the
    // click.
    await parentRow.locator('xpath=..').click()
    await expect(parentRow).not.toBeChecked()
    await expect(rootRow(page, other)).toBeChecked()

    // Reselecting restores it.
    await parentRow.locator('xpath=..').click()
    await expect(parentRow).toBeChecked()
  })

  // -------------------------------------------------------------------------
  // Ineligible copies
  // -------------------------------------------------------------------------

  test('does not offer a subname whose parent is not being migrated', {
    tag: ['@scenario:GS9'],
  }, async ({ migrationConnectedPage: page, accounts }) => {
    const userAccount = privateKeyToAccount(accounts.getPrivateKey('user'))
    const makeV1Name = createMakeV1Name({ userAccount })
    // The parent belongs to another account, so the wallet holds the subname
    // alone. Registered to the wallet, a real index lists the parent too and
    // offering the child would be right.
    const parentOwner = privateKeyToAccount(accounts.getPrivateKey('user3'))

    const parent = await createMakeV1Name({ userAccount: parentOwner })({
      label: 'migorphan',
    })
    const control = await makeV1Name({ label: 'migorphan-control' })
    const child = await makeV1RegistrySubname({
      parentName: parent.replace(/\.eth$/, ''),
      childLabel: 'sub',
      ownerAddress: HEADLESS_USER_ADDRESS,
      parentOwnerAccount: parentOwner,
    })

    // The child is injected as a ROOT hanging off its real parent, but that
    // parent is deliberately absent from the injection — exactly the shape of a
    // wallet that owns a subname but not the 2LD above it. `hasCompleteCopyRoute`
    // walks up, finds no classified ancestor, and demotes it to `missing-parent`.
    await serveV1Names(page, {
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

    await serveV1Names(page, {
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

    await runMigrationFlow(page, wallet, { roots: [parent] })

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

    await serveV1Names(page, {
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

/**
 * Wrapped children under a LOCKED 2LD (§G.GS token route).
 *
 * A locked 2LD migrates through `LockedMigrationController`, which deploys a
 * WrapperRegistry for it. That registry is itself a `LockedWrapperReceiver`:
 * the children's ERC-1155 tokens are sent to it and registered inside it, and a
 * locked child gets a WrapperRegistry of its own in turn (an emancipated child
 * is unwrapped and gets none). The parent's registry must exist before a child
 * can land in it, so the parent is always first.
 *
 * Subname trees cannot be expressed in the CI bigname mock, so these run
 * against the local bigname (real mode) and skip in mock mode. Wrapped children
 * carry their labels on chain (`NameWrapped`), so the local index can list
 * them — unlike registry-only subnames.
 */
test.describe('ENS V1 → V2 migration — wrapped children of a locked 2LD', () => {
  test.describe.configure({ timeout: 300_000 })

  const ETH_REGISTRY = ensL1Contracts[supportedL1Chains.sepolia].ensRegistry
    .address as Address

  const nextBlock = async () =>
    (await publicClient.getBlockNumber({ cacheTime: 0 })) + 1n

  test('a locked 2LD and its locked child both migrate, the parent first', {
    tag: ['@scenario:GS1'],
  }, async ({ migrationConnectedPage: page, wallet, accounts }) => {
    const userAccount = privateKeyToAccount(accounts.getPrivateKey('user'))
    const parent = await createMakeV1Name({ userAccount })({
      label: 'gs1-locked',
      type: 'locked',
    })
    const child = await makeV1Subname({
      parentName: labelOf(parent),
      childLabel: 'kid',
      ownerAddress: HEADLESS_USER_ADDRESS,
      parentOwnerAccount: userAccount,
      fuses: CHILD_FUSES.LOCKED_CHILD,
    })

    await serveV1Names(page, {
      ownerAddress: HEADLESS_USER_ADDRESS,
      roots: [
        {
          kind: 'registration',
          label: labelOf(parent),
          type: 'locked',
          children: [
            {
              kind: 'wrapped-child',
              label: 'kid',
              fuses: CHILD_FUSES.LOCKED_CHILD,
            },
          ],
        },
      ],
    })
    await openMigrationFlow(page)
    await expect(rootRow(page, parent)).toBeVisible({ timeout: 60_000 })
    await expect(nestedRow(page, child)).toBeVisible()
    await expect(
      rootRow(page, child),
      'the child follows its root',
    ).toHaveCount(0)

    const fromBlock = await nextBlock()
    await runMigrationFlow(page, wallet, { roots: [parent] })

    await assertLockedMigration(labelOf(parent))
    await assertNotUserRegistry(parent)
    const { registry } = await assertWrappedChildMigrated(
      child,
      HEADLESS_USER_ADDRESS,
      { locked: true },
    )
    expect(
      await firstRegistrationPosition(ETH_REGISTRY, fromBlock),
      'the parent is registered in the .eth registry before its child is registered in its WrapperRegistry',
    ).toBeLessThan(await firstRegistrationPosition(registry, fromBlock))
  })

  test('records on a locked child are carried to the new V2 resolver, one level down', {
    tag: ['@scenario:GR2'],
  }, async ({ migrationConnectedPage: page, wallet, accounts }) => {
    const userAccount = privateKeyToAccount(accounts.getPrivateKey('user'))
    const parent = await createMakeV1Name({ userAccount })({
      label: 'gr2-locked',
      type: 'locked',
    })
    const child = await makeV1Subname({
      parentName: labelOf(parent),
      childLabel: 'rec',
      ownerAddress: HEADLESS_USER_ADDRESS,
      parentOwnerAccount: userAccount,
      fuses: CHILD_FUSES.LOCKED_CHILD,
    })
    const records: V1Records = {
      texts: [{ key: 'description', value: 'records one level down' }],
      addresses: [{ coinType: 60, value: accounts.getAddress('user2') as Hex }],
      contenthash:
        '0xe3010170122029f2d17be6139079dc48696d1f582a8530eb9805b561eda517e22a892c7e3f1f',
    }
    // The child's wrapper owner writes its records (the shared wallet).
    await setV1RecordsOn(child, userAccount, true, records)
    await expectRecordsResolve(child, records)

    await serveV1Names(page, {
      ownerAddress: HEADLESS_USER_ADDRESS,
      roots: [
        {
          kind: 'registration',
          label: labelOf(parent),
          type: 'locked',
          children: [
            {
              kind: 'wrapped-child',
              label: 'rec',
              fuses: CHILD_FUSES.LOCKED_CHILD,
              records: {
                texts: records.texts?.map((t) => ({ ...t })),
                addresses: [
                  { coinType: 60, value: accounts.getAddress('user2') },
                ],
                contentHash: records.contenthash,
              },
            },
          ],
        },
      ],
    })
    await openMigrationFlow(page)
    await expect(rootRow(page, parent)).toBeVisible({ timeout: 60_000 })
    await expect(nestedRow(page, child)).toBeVisible()
    await runMigrationFlow(page, wallet, { roots: [parent] })

    await assertWrappedChildMigrated(child, HEADLESS_USER_ADDRESS, {
      locked: true,
    })
    expect(
      (await resolverFor(child)).toLowerCase(),
      'the child now resolves from a V2 resolver, not the V1 one',
    ).not.toBe(V1_PUBLIC_RESOLVER.toLowerCase())
    await expectRecordsResolve(child, records)
  })

  test('an emancipated child of a locked 2LD is registered in the parent WrapperRegistry, unwrapped', {
    tag: ['@scenario:GS2'],
  }, async ({ migrationConnectedPage: page, wallet, accounts }) => {
    const userAccount = privateKeyToAccount(accounts.getPrivateKey('user'))
    const parent = await createMakeV1Name({ userAccount })({
      label: 'gs2-locked',
      type: 'locked',
    })
    const child = await makeV1Subname({
      parentName: labelOf(parent),
      childLabel: 'free',
      ownerAddress: HEADLESS_USER_ADDRESS,
      parentOwnerAccount: userAccount,
      fuses: CHILD_FUSES.EMANCIPATED,
    })

    await serveV1Names(page, {
      ownerAddress: HEADLESS_USER_ADDRESS,
      roots: [
        {
          kind: 'registration',
          label: labelOf(parent),
          type: 'locked',
          children: [
            {
              kind: 'wrapped-child',
              label: 'free',
              fuses: CHILD_FUSES.EMANCIPATED,
            },
          ],
        },
      ],
    })
    await openMigrationFlow(page)
    await expect(rootRow(page, parent)).toBeVisible({ timeout: 60_000 })
    // `detached-child`: offered as a passenger of its locked root.
    await expect(nestedRow(page, child)).toBeVisible()
    await expect(rootRow(page, child)).toHaveCount(0)

    await runMigrationFlow(page, wallet, { roots: [parent] })

    await assertLockedMigration(labelOf(parent))
    await assertWrappedChildMigrated(child, HEADLESS_USER_ADDRESS, {
      locked: false,
    })
  })

  test('three locked levels each get a WrapperRegistry, outermost first', {
    tag: ['@scenario:GS6'],
  }, async ({ migrationConnectedPage: page, wallet, accounts }) => {
    const userAccount = privateKeyToAccount(accounts.getPrivateKey('user'))
    const parent = await createMakeV1Name({ userAccount })({
      label: 'gs6-locked',
      type: 'locked',
    })
    const child = await makeV1Subname({
      parentName: labelOf(parent),
      childLabel: 'mid',
      ownerAddress: HEADLESS_USER_ADDRESS,
      parentOwnerAccount: userAccount,
      fuses: CHILD_FUSES.LOCKED_CHILD,
    })
    const grandchild = await makeV1Subname({
      parentName: `mid.${labelOf(parent)}`,
      childLabel: 'leaf',
      ownerAddress: HEADLESS_USER_ADDRESS,
      parentOwnerAccount: userAccount,
      fuses: CHILD_FUSES.LOCKED_CHILD,
    })

    await serveV1Names(page, {
      ownerAddress: HEADLESS_USER_ADDRESS,
      roots: [
        {
          kind: 'registration',
          label: labelOf(parent),
          type: 'locked',
          children: [
            {
              kind: 'wrapped-child',
              label: 'mid',
              fuses: CHILD_FUSES.LOCKED_CHILD,
              children: [
                {
                  kind: 'wrapped-child',
                  label: 'leaf',
                  fuses: CHILD_FUSES.LOCKED_CHILD,
                },
              ],
            },
          ],
        },
      ],
    })
    await openMigrationFlow(page)
    await expect(rootRow(page, parent)).toBeVisible({ timeout: 60_000 })
    await expect(nestedRow(page, child)).toBeVisible()
    await expect(nestedRow(page, grandchild)).toBeVisible()

    const fromBlock = await nextBlock()
    await runMigrationFlow(page, wallet, { roots: [parent] })

    await assertLockedMigration(labelOf(parent))
    const mid = await assertWrappedChildMigrated(child, HEADLESS_USER_ADDRESS, {
      locked: true,
    })
    const leaf = await assertWrappedChildMigrated(
      grandchild,
      HEADLESS_USER_ADDRESS,
      { locked: true },
    )
    // Recursive derivation: the grandchild lives in the child's WrapperRegistry.
    expect(leaf.registry.toLowerCase()).toBe(mid.subregistry.toLowerCase())
    const [eth, parentWr, childWr] = await Promise.all([
      firstRegistrationPosition(ETH_REGISTRY, fromBlock),
      firstRegistrationPosition(mid.registry, fromBlock),
      firstRegistrationPosition(leaf.registry, fromBlock),
    ])
    expect(eth, 'the parent is registered before the child').toBeLessThan(
      parentWr,
    )
    expect(
      parentWr,
      'the child is registered before the grandchild',
    ).toBeLessThan(childWr)
  })
})

/** Account 0's standalone HCA — the deployer the app predicts UserRegistries for. */
const HEADLESS_USER_HCA = '0xF1554d7361E0663896F57A121C83638856f0ED91' as const
/** `@ens-apps/smart-account` `verifiableFactoryProxyLogic` (Sepolia). */
const VERIFIABLE_FACTORY_PROXY_LOGIC =
  '0xC41576B4B809B99CF0fF2e5B41b4F147cd9b6BDd' as const
const STATUS_ABI = parseAbi([
  'function getStatus(uint256 anyId) view returns (uint8)',
])

/**
 * The address the app deploys `parent`'s UserRegistry at
 * (`computeUserRegistryAddress`: VerifiableFactory CREATE2, deployer = the
 * HCA, salt = keccak(domain, namehash(parent))). Checked against a registry
 * the app really deployed on the fork, 2026-10-11.
 */
function predictUserRegistry(parent: string): Address {
  const salt = BigInt(
    keccak256(
      encodeAbiParameters(
        [{ type: 'bytes32' }, { type: 'bytes32' }],
        [
          keccak256(stringToHex('ENSManagerMigrationUserRegistry:v1')),
          namehashOf(parent),
        ],
      ),
    ),
  )
  const outer = keccak256(
    encodeAbiParameters(
      [{ type: 'address' }, { type: 'uint256' }],
      [HEADLESS_USER_HCA, salt],
    ),
  )
  return getContractAddress({
    bytecode: concatHex([
      '0x3d604d80600a3d3981f3363d3d373d3d3d363d73',
      VERIFIABLE_FACTORY_PROXY_LOGIC,
      '0x5af43d82803e903d91602b57fd5bf3',
      outer,
    ]),
    from: ensL1Contracts[supportedL1Chains.sepolia].ensVerifiableFactory
      .address as Address,
    opcode: 'CREATE2',
    salt: outer,
  })
}

test.describe('ENS V1 → V2 migration — subname edge cases (§G.GS)', () => {
  test.describe.configure({ timeout: 600_000 })

  const DAY = 24n * 3600n
  const chainNow = async () =>
    (await publicClient.getBlock({ blockTag: 'latest' })).timestamp

  test('an unlocked subname wrapped under an UNWRAPPED 2LD is copied with its parent', {
    tag: ['@scenario:GS10'],
  }, async ({ migrationConnectedPage: page, wallet, accounts }) => {
    test.fail(
      true,
      'E2E-025: the live preflight treats a zero wrapper expiry as expired, so the child is silently dropped',
    )
    const userAccount = privateKeyToAccount(accounts.getPrivateKey('user'))
    const parent = await createMakeV1Name({ userAccount })({
      label: 'gs10-unwrapped',
    })
    // `NameWrapper.wrap` under an unwrapped parent: no fuses, and a wrapper
    // expiry of 0 — no expiry of its own, which the copy route must not read
    // as expired.
    const child = await wrapV1SubnameOfUnwrapped({
      parentLabel: labelOf(parent),
      childLabel: 'wrapped',
      parentOwnerAccount: userAccount,
      ownerAccount: userAccount,
    })

    await serveV1Names(page, {
      ownerAddress: HEADLESS_USER_ADDRESS,
      roots: [
        {
          kind: 'registration',
          label: labelOf(parent),
          children: [
            {
              kind: 'wrapped-child',
              label: 'wrapped',
              fuses: CHILD_FUSES.UNLOCKED_CHILD,
              expiryDate: 0,
            },
          ],
        },
      ],
    })
    await openMigrationFlow(page)
    await expect(rootRow(page, parent)).toBeVisible({ timeout: 60_000 })
    await expect(
      nestedRow(page, child),
      'the wrapped child is offered as a copy under its root',
    ).toBeVisible({ timeout: 30_000 })
    await runMigrationFlow(page, wallet, { roots: [parent] })

    await assertV2Registered(labelOf(parent))
    await assertUserRegistryAttached(parent)
    await assertCopyRegistered(child, HEADLESS_USER_ADDRESS)
  })

  test('a four-level chain of unlocked subnames is copied level by level', {
    tag: ['@scenario:GS10'],
  }, async ({ migrationConnectedPage: page, wallet, accounts }) => {
    const userAccount = privateKeyToAccount(accounts.getPrivateKey('user'))
    const parent = await createMakeV1Name({ userAccount })({
      label: 'gs10-chain',
      type: 'wrapped',
    })
    const expiry = (await chainNow()) + 180n * DAY
    const mid = await makeV1Subname({
      parentName: labelOf(parent),
      childLabel: 'mid',
      ownerAddress: HEADLESS_USER_ADDRESS,
      parentOwnerAccount: userAccount,
      expiry,
    })
    const leaf = await makeV1Subname({
      parentName: mid.replace(/\.eth$/, ''),
      childLabel: 'leaf',
      ownerAddress: HEADLESS_USER_ADDRESS,
      parentOwnerAccount: userAccount,
      expiry,
    })

    await serveV1Names(page, {
      ownerAddress: HEADLESS_USER_ADDRESS,
      roots: [
        {
          kind: 'registration',
          label: labelOf(parent),
          type: 'wrapped',
          wrapperExpiry: Number(await readWrapperExpiry(parent)),
          children: [
            {
              kind: 'wrapped-child',
              label: 'mid',
              fuses: CHILD_FUSES.UNLOCKED_CHILD,
              expiryDate: Number(await readWrapperExpiry(mid)),
              children: [
                {
                  kind: 'wrapped-child',
                  label: 'leaf',
                  fuses: CHILD_FUSES.UNLOCKED_CHILD,
                  expiryDate: Number(await readWrapperExpiry(leaf)),
                },
              ],
            },
          ],
        },
      ],
    })
    await openMigrationFlow(page)
    await expect(rootRow(page, parent)).toBeVisible({ timeout: 60_000 })
    await expect(nestedRow(page, mid)).toBeVisible({ timeout: 30_000 })
    await expect(nestedRow(page, leaf)).toBeVisible()
    await runMigrationFlow(page, wallet, { roots: [parent] })

    await assertUserRegistryAttached(parent)
    await assertCopyRegistered(mid, HEADLESS_USER_ADDRESS)
    await assertUserRegistryAttached(mid)
    await assertCopyRegistered(leaf, HEADLESS_USER_ADDRESS)
  })

  test('a copy child whose own expiry has passed is not offered, and its parent migrates alone', {
    tag: ['@scenario:GS12'],
  }, async ({ migrationConnectedPage: page, wallet, accounts }) => {
    const userAccount = privateKeyToAccount(accounts.getPrivateKey('user'))
    const parent = await createMakeV1Name({ userAccount })({
      label: 'gs12-parent',
      type: 'wrapped',
    })
    const now = await chainNow()
    const expired = await makeV1Subname({
      parentName: labelOf(parent),
      childLabel: 'lapsed',
      ownerAddress: HEADLESS_USER_ADDRESS,
      parentOwnerAccount: userAccount,
      expiry: now - DAY,
    })
    // Control: a live sibling, so "not offered" cannot mean "nothing listed".
    const live = await makeV1Subname({
      parentName: labelOf(parent),
      childLabel: 'live',
      ownerAddress: HEADLESS_USER_ADDRESS,
      parentOwnerAccount: userAccount,
      expiry: now + 180n * DAY,
    })

    await serveV1Names(page, {
      ownerAddress: HEADLESS_USER_ADDRESS,
      roots: [
        {
          kind: 'registration',
          label: labelOf(parent),
          type: 'wrapped',
          wrapperExpiry: Number(await readWrapperExpiry(parent)),
          children: [
            {
              kind: 'wrapped-child',
              label: 'lapsed',
              fuses: CHILD_FUSES.UNLOCKED_CHILD,
              expiryDate: Number(await readWrapperExpiry(expired)),
            },
            {
              kind: 'wrapped-child',
              label: 'live',
              fuses: CHILD_FUSES.UNLOCKED_CHILD,
              expiryDate: Number(await readWrapperExpiry(live)),
            },
          ],
        },
      ],
    })
    await openMigrationFlow(page)
    await expect(rootRow(page, parent)).toBeVisible({ timeout: 60_000 })
    await expect(nestedRow(page, live)).toBeVisible({ timeout: 30_000 })
    await expect(
      anyRow(page, expired),
      'an expired copy child is not offered',
    ).toHaveCount(0)
    await runMigrationFlow(page, wallet, { roots: [parent] })

    await assertCopyRegistered(live, HEADLESS_USER_ADDRESS)
    await assertNotInV2(expired)
  })

  test('an emancipated child whose wrapper expired is not offered, and its locked parent migrates alone', {
    tag: ['@scenario:GS5'],
  }, async ({ migrationConnectedPage: page, wallet, accounts }) => {
    // The NameWrapper zeroes an expired PARENT_CANNOT_CONTROL child's owner
    // and fuses: on chain nobody holds it any more, so it has nothing to
    // migrate. Expected behaviour, defined here: not offered, not moved, and
    // the parent unaffected.
    const userAccount = privateKeyToAccount(accounts.getPrivateKey('user'))
    const parent = await createMakeV1Name({ userAccount })({
      label: 'gs5-locked',
      type: 'locked',
    })
    const now = await chainNow()
    const expired = await makeV1Subname({
      parentName: labelOf(parent),
      childLabel: 'gone',
      ownerAddress: HEADLESS_USER_ADDRESS,
      parentOwnerAccount: userAccount,
      fuses: CHILD_FUSES.EMANCIPATED,
      expiry: now - DAY,
    })
    const live = await makeV1Subname({
      parentName: labelOf(parent),
      childLabel: 'kept',
      ownerAddress: HEADLESS_USER_ADDRESS,
      parentOwnerAccount: userAccount,
      fuses: CHILD_FUSES.EMANCIPATED,
    })

    await serveV1Names(page, {
      ownerAddress: HEADLESS_USER_ADDRESS,
      roots: [
        {
          kind: 'registration',
          label: labelOf(parent),
          type: 'locked',
          children: [
            {
              kind: 'wrapped-child',
              label: 'gone',
              fuses: CHILD_FUSES.EMANCIPATED,
            },
            {
              kind: 'wrapped-child',
              label: 'kept',
              fuses: CHILD_FUSES.EMANCIPATED,
            },
          ],
        },
      ],
    })
    await openMigrationFlow(page)
    await expect(rootRow(page, parent)).toBeVisible({ timeout: 60_000 })
    await expect(nestedRow(page, live)).toBeVisible({ timeout: 30_000 })
    await expect(
      anyRow(page, expired),
      'an expired emancipated child is not offered',
    ).toHaveCount(0)
    await runMigrationFlow(page, wallet, { roots: [parent] })

    await assertLockedMigration(labelOf(parent))
    await assertWrappedChildMigrated(live, HEADLESS_USER_ADDRESS, {
      locked: false,
    })
    await assertNotInV2(expired)
  })

  test('a copy child held by another address is not offered to the parent’s owner', {
    tag: ['@scenario:GS18'],
  }, async ({ migrationConnectedPage: page, wallet, accounts }) => {
    const userAccount = privateKeyToAccount(accounts.getPrivateKey('user'))
    const other = accounts.getAddress('user2') as Address
    const parent = await createMakeV1Name({ userAccount })({
      label: 'gs18-parent',
      type: 'wrapped',
    })
    const expiry = (await chainNow()) + 180n * DAY
    const theirs = await makeV1Subname({
      parentName: labelOf(parent),
      childLabel: 'theirs',
      ownerAddress: other,
      parentOwnerAccount: userAccount,
      expiry,
    })
    const mine = await makeV1Subname({
      parentName: labelOf(parent),
      childLabel: 'mine',
      ownerAddress: HEADLESS_USER_ADDRESS,
      parentOwnerAccount: userAccount,
      expiry,
    })

    await serveV1Names(page, {
      ownerAddress: HEADLESS_USER_ADDRESS,
      roots: [
        {
          kind: 'registration',
          label: labelOf(parent),
          type: 'wrapped',
          wrapperExpiry: Number(await readWrapperExpiry(parent)),
          children: [
            {
              kind: 'wrapped-child',
              label: 'theirs',
              fuses: CHILD_FUSES.UNLOCKED_CHILD,
              ownerAddress: other,
              expiryDate: Number(await readWrapperExpiry(theirs)),
            },
            {
              kind: 'wrapped-child',
              label: 'mine',
              fuses: CHILD_FUSES.UNLOCKED_CHILD,
              expiryDate: Number(await readWrapperExpiry(mine)),
            },
          ],
        },
      ],
    })
    await openMigrationFlow(page)
    await expect(rootRow(page, parent)).toBeVisible({ timeout: 60_000 })
    await expect(nestedRow(page, mine)).toBeVisible({ timeout: 30_000 })
    await expect(
      anyRow(page, theirs),
      'a child someone else holds is not the parent owner’s to move',
    ).toHaveCount(0)
    await runMigrationFlow(page, wallet, { roots: [parent] })

    await assertCopyRegistered(mine, HEADLESS_USER_ADDRESS)
    await assertNotInV2(theirs)
  })

  test('a locked 2LD with ten locked children: every child lands, after its parent', {
    tag: ['@scenario:GS8'],
  }, async ({ migrationConnectedPage: page, wallet, accounts }) => {
    const userAccount = privateKeyToAccount(accounts.getPrivateKey('user'))
    const parent = await createMakeV1Name({ userAccount })({
      label: 'gs8-locked',
      type: 'locked',
    })
    const labels = Array.from({ length: 10 }, (_, i) => `c${i}`)
    const children: string[] = []
    for (const childLabel of labels)
      children.push(
        await makeV1Subname({
          parentName: labelOf(parent),
          childLabel,
          ownerAddress: HEADLESS_USER_ADDRESS,
          parentOwnerAccount: userAccount,
          fuses: CHILD_FUSES.LOCKED_CHILD,
        }),
      )

    await serveV1Names(page, {
      ownerAddress: HEADLESS_USER_ADDRESS,
      roots: [
        {
          kind: 'registration',
          label: labelOf(parent),
          type: 'locked',
          children: labels.map((label) => ({
            kind: 'wrapped-child' as const,
            label,
            fuses: CHILD_FUSES.LOCKED_CHILD,
          })),
        },
      ],
    })
    await openMigrationFlow(page)
    await expect(rootRow(page, parent)).toBeVisible({ timeout: 60_000 })
    for (const child of children)
      await expect(nestedRow(page, child)).toBeVisible({ timeout: 30_000 })

    const fromBlock = (await publicClient.getBlockNumber({ cacheTime: 0 })) + 1n
    await runMigrationFlow(page, wallet, { roots: [parent] })

    await assertLockedMigration(labelOf(parent))
    let registry: Address | undefined
    for (const child of children) {
      const landed = await assertWrappedChildMigrated(
        child,
        HEADLESS_USER_ADDRESS,
        { locked: true },
      )
      registry ??= landed.registry
      expect(
        landed.registry,
        `${child} sits in its parent's WrapperRegistry`,
      ).toBe(registry)
    }
    const ETH_REGISTRY = ensL1Contracts[supportedL1Chains.sepolia].ensRegistry
      .address as Address
    expect(
      await firstRegistrationPosition(ETH_REGISTRY, fromBlock),
      'the parent is registered before any child',
    ).toBeLessThan(
      await firstRegistrationPosition(registry as Address, fromBlock),
    )
  })

  test('a copy whose deterministic UserRegistry slot is already occupied fails closed, writing nothing', {
    tag: ['@scenario:GS17'],
  }, async ({ migrationConnectedPage: page, wallet, accounts }) => {
    const userAccount = privateKeyToAccount(accounts.getPrivateKey('user'))
    const parent = await createMakeV1Name({ userAccount })({
      label: 'gs17-dirty',
      type: 'wrapped',
    })
    const child = await makeV1Subname({
      parentName: labelOf(parent),
      childLabel: 'sub',
      ownerAddress: HEADLESS_USER_ADDRESS,
      parentOwnerAccount: userAccount,
      expiry: (await chainNow()) + 180n * DAY,
    })

    // The UserRegistry the app will deploy for this parent lives at a
    // CREATE2 address it predicts without a chain read. Occupy it first:
    // "prior state" the copy must not write over.
    const slot = predictUserRegistry(parent)
    const planted = '0x60006000fd' as const // PUSH 0 PUSH 0 REVERT
    await testClient.setCode({ address: slot, bytecode: planted })

    await serveV1Names(page, {
      ownerAddress: HEADLESS_USER_ADDRESS,
      roots: [
        {
          kind: 'registration',
          label: labelOf(parent),
          type: 'wrapped',
          wrapperExpiry: Number(await readWrapperExpiry(parent)),
          children: [
            {
              kind: 'wrapped-child',
              label: 'sub',
              fuses: CHILD_FUSES.UNLOCKED_CHILD,
              expiryDate: Number(await readWrapperExpiry(child)),
            },
          ],
        },
      ],
    })
    await openMigrationFlow(page)
    await expect(rootRow(page, parent)).toBeVisible({ timeout: 60_000 })
    await expect(nestedRow(page, child)).toBeVisible({ timeout: 30_000 })
    await selectOnlyRoots(page, [parent])

    // Refused while planning, before any prompt: the readiness check finds
    // code where the registry should not exist yet (`unexpected-registry`).
    await expect(
      page.getByText("Couldn't prepare your upgrade"),
      'the plan is refused',
    ).toBeVisible({ timeout: 60_000 })
    await expect(
      page.getByRole('button', { name: /^Upgrade \d+ names?$/ }),
      'nothing can be submitted',
    ).toBeDisabled()
    expect(
      wallet.getPendingRequestCount(Web3RequestKind.SendTransaction),
      'the wallet was never asked',
    ).toBe(0)

    // Fails closed: nothing written anywhere.
    expect(
      await publicClient.getCode({ address: slot }),
      'the occupied slot is untouched',
    ).toBe(planted)
    expect(
      await publicClient.readContract({
        address: ensL1Contracts[supportedL1Chains.sepolia].ensRegistry
          .address as Address,
        abi: STATUS_ABI,
        functionName: 'getStatus',
        args: [BigInt(labelhash(labelOf(parent)))],
      }),
      'the parent is still RESERVED in V2',
    ).toBe(1)
    await assertNotInV2(child)
  })

  test('a copy stopped between its batches: the parent and the first copies land, and the rest are still offered and copy on retry', {
    tag: ['@scenario:GU7'],
  }, async ({ migrationConnectedPage: page, wallet, accounts }) => {
    const userAccount = privateKeyToAccount(accounts.getPrivateKey('user'))
    const parent = await createMakeV1Name({ userAccount })({
      label: 'gu7-copy-split',
      type: 'wrapped',
    })
    // Records make each copy heavy (one replayed text ~50k gas), so the
    // copies cannot share one transaction with the parent's own block.
    const records: V1Records = {
      texts: Array.from({ length: 30 }, (_, i) => ({
        key: `gu7.key-${String(i).padStart(2, '0')}`,
        value: `value ${i}`,
      })),
    }
    const expiry = (await chainNow()) + 180n * DAY
    const labels = Array.from({ length: 12 }, (_, i) => `c${i}`)
    const children: string[] = []
    for (const childLabel of labels) {
      const child = await makeV1Subname({
        parentName: labelOf(parent),
        childLabel,
        ownerAddress: HEADLESS_USER_ADDRESS,
        parentOwnerAccount: userAccount,
        expiry,
      })
      await setV1RecordsOn(child, userAccount, true, records)
      children.push(child)
    }

    const childNode = async (label: string, child: string) => ({
      kind: 'wrapped-child' as const,
      label,
      fuses: CHILD_FUSES.UNLOCKED_CHILD,
      expiryDate: Number(await readWrapperExpiry(child)),
      records: { texts: records.texts?.map((t) => ({ ...t })) },
    })
    await serveV1Names(page, {
      ownerAddress: HEADLESS_USER_ADDRESS,
      roots: [
        {
          kind: 'registration',
          label: labelOf(parent),
          type: 'wrapped',
          wrapperExpiry: Number(await readWrapperExpiry(parent)),
          children: await Promise.all(
            labels.map((label, i) => childNode(label, children[i])),
          ),
        },
      ],
    })
    await openMigrationFlow(page)
    await expect(rootRow(page, parent)).toBeVisible({ timeout: 60_000 })
    for (const child of children)
      await expect(nestedRow(page, child)).toBeVisible({ timeout: 30_000 })
    await selectOnlyRoots(page, [parent])

    const plan = await readPlan(page)
    const batches = plan.steps.filter((s) => /^Upgrade /.test(s))
    expect(
      batches.length,
      `precondition: the copy spans transactions (${batches.join(' · ')})`,
    ).toBeGreaterThan(1)

    // Authorize every prompt but the last upgrade batch; reject that one.
    await page.getByRole('button', { name: /^Upgrade \d+ names?$/ }).click()
    for (let i = 0; i < plan.count - 1; i++) {
      await expect
        .poll(
          () => wallet.getPendingRequestCount(Web3RequestKind.SendTransaction),
          { timeout: 120_000 },
        )
        .toBeGreaterThanOrEqual(1)
      await wallet.authorize(Web3RequestKind.SendTransaction)
    }
    await expect
      .poll(
        () => wallet.getPendingRequestCount(Web3RequestKind.SendTransaction),
        { timeout: 120_000 },
      )
      .toBeGreaterThanOrEqual(1)
    await wallet.reject(Web3RequestKind.SendTransaction)
    await page.reload()
    while (wallet.getPendingRequestCount(Web3RequestKind.SendTransaction) > 0)
      await wallet.reject(Web3RequestKind.SendTransaction)

    // On chain: the parent's block landed whole, the later copies did not.
    await assertV2Registered(labelOf(parent))
    await assertUserRegistryAttached(parent)
    const statuses = await Promise.all(children.map(readV2NameStatus))
    const copied = children.filter((_, i) => statuses[i] === 2)
    const left = children.filter((_, i) => statuses[i] !== 2)
    console.log(
      `[GU7] after batch 1: ${copied.length} copied, ${left.length} left`,
    )
    expect(
      left.length,
      'precondition: some copies were left for batch 2',
    ).toBeGreaterThan(0)
    for (const child of copied) await expectRecordsResolve(child, records)

    // The retry: every remaining subname is still offered, and copies.
    await waitForBignameBlock()
    await openMigrationFlow(page)
    for (const child of left)
      await expect(
        rootRow(page, child).or(nestedRow(page, child)).first(),
        `${child} is still offered after the interrupted copy`,
      ).toBeVisible({ timeout: 60_000 })
    await confirmAndAuthorize(page, wallet)
    for (const child of left) {
      await assertCopyRegistered(child, HEADLESS_USER_ADDRESS)
      await expectRecordsResolve(child, records)
    }
  })
})

/**
 * Registry-only subnames (created with `ENSRegistry.setSubnodeOwner`, no
 * NameWrapper token) under each kind of parent. GS4/GS14 cover the unwrapped
 * parent; these cover a parent that was wrapped AFTER the subname existed —
 * the only way the shape arises, since a wrapped parent's registry owner is
 * the NameWrapper — and a label the index cannot name.
 *
 * Subname trees cannot be expressed in the CI bigname mock, so these run
 * against the local bigname and skip in mock mode (`serveV1Names`).
 */
test.describe('ENS V1 → V2 migration — registry-only subnames by parent kind', () => {
  test.describe.configure({ timeout: 300_000 })

  /** A 2LD of `type` with a registry-only `sub` created before the wrap. */
  async function seedParentWithRegistryChild(
    accounts: PortalAccounts,
    label: string,
    type: 'wrapped' | 'locked' | 'unwrapped',
    options: { seedLabel?: boolean; childLabel?: string } = {},
  ) {
    const childLabel = options.childLabel ?? 'sub'
    const userAccount = privateKeyToAccount(accounts.getPrivateKey('user'))
    let child = ''
    const createChild = async (ethName: string) => {
      child = await makeV1RegistrySubname({
        parentName: ethName.replace(/\.eth$/, ''),
        childLabel,
        ownerAddress: HEADLESS_USER_ADDRESS,
        parentOwnerAccount: userAccount,
        seedLabel: options.seedLabel,
      })
    }
    const parent = await createMakeV1Name({ userAccount })({
      label,
      type,
      beforeWrap: createChild,
    })
    if (type === 'unwrapped') await createChild(parent)
    return { parent, child, userAccount }
  }

  test('copies a registry-only subname under an UNLOCKED wrapped 2LD', {
    tag: ['@scenario:GS19'],
  }, async ({ migrationConnectedPage: page, wallet, accounts }) => {
    const { parent, child } = await seedParentWithRegistryChild(
      accounts,
      'migwrapreg',
      'wrapped',
    )

    await serveV1Names(page, {
      ownerAddress: HEADLESS_USER_ADDRESS,
      roots: [
        {
          kind: 'registration',
          label: labelOf(parent),
          type: 'wrapped',
          children: [{ kind: 'registry-child', label: 'sub' }],
        },
      ],
    })

    await openMigrationFlow(page)
    await expect(rootRow(page, parent)).toBeVisible({ timeout: 30_000 })
    await expect(nestedRow(page, child)).toBeVisible()

    await runMigrationFlow(page, wallet, { roots: [parent] })

    // The wrapped parent's token migrates through the unlocked controller…
    await assertV2Registered(labelOf(parent))
    // …and the registry-only child is re-created in its UserRegistry, with the
    // registry-child sentinel expiry, exactly as under an unwrapped parent.
    await assertUserRegistryAttached(parent)
    await assertCopyRegistered(child, HEADLESS_USER_ADDRESS)
    await assertCopyExpiry(child, MAX_UINT64)
  })

  test('shows a registry-only subname under a LOCKED 2LD as not upgradable', {
    tag: ['@scenario:GS20'],
  }, async ({ migrationConnectedPage: page, accounts }) => {
    // A locked 2LD migrates as a token into a WrapperRegistry; a registry-only
    // child has no token to follow it, and the copy route needs an unwrapped or
    // unlocked parent. Classification rejects it as `missing-parent` — correct —
    // but the upgrade list renders only `missing-registration` and
    // `not-reserved`, so the owner never sees it.
    const { parent, child } = await seedParentWithRegistryChild(
      accounts,
      'miglockreg',
      'locked',
    )

    await serveV1Names(page, {
      ownerAddress: HEADLESS_USER_ADDRESS,
      roots: [
        {
          kind: 'registration',
          label: labelOf(parent),
          type: 'locked',
          children: [{ kind: 'registry-child', label: 'sub' }],
        },
      ],
    })

    await openMigrationFlow(page)
    // Precondition: the parent itself is offered, so the page has the data.
    await expect(rootRow(page, parent)).toBeVisible({ timeout: 30_000 })
    await expect(
      page.getByRole('button', { name: child, exact: true }),
      `${child} cannot be copied under a locked parent and must not be selectable`,
    ).toHaveCount(0)

    test.fail(
      true,
      'E2E-031: a registry-only subname under a locked 2LD is silently left off the upgrade list',
    )
    await expect(
      page.getByText(child, { exact: true }),
      `${child} is silently dropped instead of being shown as not upgradable`,
    ).toBeVisible({ timeout: 15_000 })
  })

  test('shows a registry-only subname the index cannot name as not upgradable', {
    tag: ['@scenario:GS21'],
  }, async ({ migrationConnectedPage: page, accounts }) => {
    test.skip(
      !isRealBigname,
      'needs a real index that lacks the label; the mock always serves full names',
    )
    // `setSubnodeOwner` puts only the labelhash on chain. Without a rainbow
    // entry the index lists the child as `[labelhash].parent.eth`;
    // classification rejects it as `unknown-label` before anything is sent —
    // correct, since the copy must pass the label — but the upgrade list does
    // not render that reason, so the owner never learns the subname exists.
    // A label of its own: labels are global per hash, so one any other test
    // seeds (`sub`) is known to the index for good.
    const childLabel = `hidden${Date.now().toString(36)}`
    const { parent, child } = await seedParentWithRegistryChild(
      accounts,
      'migunknown',
      'unwrapped',
      { seedLabel: false, childLabel },
    )
    const placeholder = `[${labelhash(childLabel).slice(2)}].${parent}`

    await serveV1Names(page, {
      ownerAddress: HEADLESS_USER_ADDRESS,
      roots: [
        {
          kind: 'registration',
          label: labelOf(parent),
          children: [{ kind: 'registry-child', label: childLabel }],
        },
      ],
    })

    await openMigrationFlow(page)
    await expect(rootRow(page, parent)).toBeVisible({ timeout: 30_000 })
    // Precondition: the label really is unknown to the index (the app would
    // otherwise show `child` and offer the copy).
    await expect(nestedRow(page, child)).toHaveCount(0)

    test.fail(
      true,
      'E2E-032: a registry-only subname whose label the index does not know is silently left off the upgrade list',
    )
    await expect(
      page
        .getByText(placeholder, { exact: true })
        .or(page.getByText(child, { exact: true })),
      `${child} is silently dropped instead of being shown as not upgradable`,
    ).toBeVisible({ timeout: 15_000 })
  })

  test('a registry-only subname of a LOCKED 2LD, wrapped and emancipated first, migrates with it', {
    tag: ['@scenario:GS22'],
  }, async ({ migrationConnectedPage: page, wallet, accounts }) => {
    // The way out of E2E-031: the owner wraps the subname and burns
    // PARENT_CANNOT_CONTROL on it before upgrading. It is then an emancipated
    // child (`detached-child`), which follows its locked parent into the
    // parent's WrapperRegistry exactly like GS2.
    const { parent, child, userAccount } = await seedParentWithRegistryChild(
      accounts,
      'migfreereg',
      'locked',
    )
    await wrapAndEmancipateRegistryChild({
      parentName: parent,
      childLabel: 'sub',
      parentOwnerAccount: userAccount,
      ownerAccount: userAccount,
    })

    await serveV1Names(page, {
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
              fuses: CHILD_FUSES.EMANCIPATED,
            },
          ],
        },
      ],
    })
    await openMigrationFlow(page)
    await expect(rootRow(page, parent)).toBeVisible({ timeout: 60_000 })
    await expect(nestedRow(page, child)).toBeVisible()

    await runMigrationFlow(page, wallet, { roots: [parent] })

    await assertLockedMigration(labelOf(parent))
    await assertWrappedChildMigrated(child, HEADLESS_USER_ADDRESS, {
      locked: false,
    })
  })

  test('migrating a LOCKED 2LD leaves its registry-only subname resolving', {
    tag: ['@scenario:GS23'],
  }, async ({ migrationConnectedPage: page, wallet, accounts }) => {
    // What E2E-031 costs: the subname is not offered, but its parent is. After
    // the parent moves to V2, does the left-behind subname still resolve?
    const { parent, child, userAccount } = await seedParentWithRegistryChild(
      accounts,
      'migstrand',
      'locked',
    )
    const records: V1Records = {
      texts: [{ key: 'description', value: 'left behind in V1' }],
      addresses: [{ coinType: 60, value: accounts.getAddress('user3') as Hex }],
    }
    await setV1RecordsOn(child, userAccount, false, records)
    // Precondition: it resolves before anything moves.
    await expectRecordsResolve(child, records)

    await serveV1Names(page, {
      ownerAddress: HEADLESS_USER_ADDRESS,
      roots: [
        {
          kind: 'registration',
          label: labelOf(parent),
          type: 'locked',
          children: [{ kind: 'registry-child', label: 'sub' }],
        },
      ],
    })
    await openMigrationFlow(page)
    await expect(rootRow(page, parent)).toBeVisible({ timeout: 60_000 })
    await runMigrationFlow(page, wallet, { roots: [parent] })
    await assertLockedMigration(labelOf(parent))

    // Measured 2026-10-14: it does not — resolution now walks the parent's
    // V2 WrapperRegistry, which never received the subname.
    test.fail(
      true,
      'E2E-031: migrating a locked 2LD silently stops its registry-only subname resolving',
    )
    await expectRecordsResolve(child, records)
  })
})

/**
 * After a subname migrates, its manager profile shows the records it carried
 * (e2e-gap-analysis.md §1, Bug 2). The record tests above prove the records
 * resolve on chain; these open the page a user actually reads.
 */
const MANAGER_APP_URL = process.env.MANAGER_APP_URL ?? 'http://localhost:3000'

test.describe('ENS V1 → V2 migration — the manager profile after a subname copy', () => {
  test.describe.configure({ timeout: 300_000 })

  const RECORDS = (what: string): V1Records => ({
    texts: [{ key: 'description', value: `${what} carried over` }],
  })

  async function expectProfileShows(
    page: import('@playwright/test').Page,
    name: string,
    text: string,
  ) {
    await page.goto(`${MANAGER_APP_URL}/${name}`)
    await expect(page.getByRole('heading', { name })).toBeVisible({
      timeout: 60_000,
    })
    await expect(
      page.getByText(text, { exact: true }),
      `${name}'s profile does not show the record that resolves on chain`,
    ).toBeVisible({ timeout: 30_000 })
  }

  test('a copied registry-only subname shows its records on its profile', {
    tag: ['@scenario:GR2'],
  }, async ({ migrationConnectedPage: page, wallet, accounts }) => {
    const userAccount = privateKeyToAccount(accounts.getPrivateKey('user'))
    const parent = await createMakeV1Name({ userAccount })({
      label: 'gr2-reg-profile',
    })
    const child = await makeV1RegistrySubname({
      parentName: labelOf(parent),
      childLabel: 'sub',
      ownerAddress: HEADLESS_USER_ADDRESS,
      parentOwnerAccount: userAccount,
    })
    const records = RECORDS('registry child')
    await setV1RecordsOn(child, userAccount, false, records)

    await serveV1Names(page, {
      ownerAddress: HEADLESS_USER_ADDRESS,
      roots: [
        {
          kind: 'registration',
          label: labelOf(parent),
          children: [
            {
              kind: 'registry-child',
              label: 'sub',
              records: { texts: records.texts?.map((t) => ({ ...t })) },
            },
          ],
        },
      ],
    })
    await openMigrationFlow(page)
    await expect(nestedRow(page, child)).toBeVisible({ timeout: 60_000 })
    await runMigrationFlow(page, wallet, { roots: [parent] })
    await assertCopyRegistered(child, HEADLESS_USER_ADDRESS)
    // Precondition: on chain the record made it across.
    await expectRecordsResolve(child, records)
    await waitForBignameBlock()

    await expectProfileShows(page, child, 'registry child carried over')
  })

  test('a copied wrapped subname shows its records on its profile', {
    tag: ['@scenario:GR2'],
  }, async ({ migrationConnectedPage: page, wallet, accounts }) => {
    const userAccount = privateKeyToAccount(accounts.getPrivateKey('user'))
    const parent = await createMakeV1Name({ userAccount })({
      label: 'gr2-wrap-profile',
      type: 'wrapped',
    })
    const child = await makeV1Subname({
      parentName: labelOf(parent),
      childLabel: 'sub',
      ownerAddress: HEADLESS_USER_ADDRESS,
      parentOwnerAccount: userAccount,
      fuses: CHILD_FUSES.UNLOCKED_CHILD,
    })
    const records = RECORDS('wrapped child')
    await setV1RecordsOn(child, userAccount, true, records)

    await serveV1Names(page, {
      ownerAddress: HEADLESS_USER_ADDRESS,
      roots: [
        {
          kind: 'registration',
          label: labelOf(parent),
          type: 'wrapped',
          children: [
            {
              kind: 'wrapped-child',
              label: 'sub',
              fuses: CHILD_FUSES.UNLOCKED_CHILD,
              records: { texts: records.texts?.map((t) => ({ ...t })) },
            },
          ],
        },
      ],
    })
    await openMigrationFlow(page)
    await expect(nestedRow(page, child)).toBeVisible({ timeout: 60_000 })
    await runMigrationFlow(page, wallet, { roots: [parent] })
    await assertCopyRegistered(child, HEADLESS_USER_ADDRESS)
    await expectRecordsResolve(child, records)
    await waitForBignameBlock()

    await expectProfileShows(page, child, 'wrapped child carried over')
  })

  test('a migrated locked child shows its records on its profile', {
    tag: ['@scenario:GR2'],
  }, async ({ migrationConnectedPage: page, wallet, accounts }) => {
    const userAccount = privateKeyToAccount(accounts.getPrivateKey('user'))
    const parent = await createMakeV1Name({ userAccount })({
      label: 'gr2-lock-profile',
      type: 'locked',
    })
    const child = await makeV1Subname({
      parentName: labelOf(parent),
      childLabel: 'sub',
      ownerAddress: HEADLESS_USER_ADDRESS,
      parentOwnerAccount: userAccount,
      fuses: CHILD_FUSES.LOCKED_CHILD,
    })
    const records = RECORDS('locked child')
    await setV1RecordsOn(child, userAccount, true, records)

    await serveV1Names(page, {
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
              records: { texts: records.texts?.map((t) => ({ ...t })) },
            },
          ],
        },
      ],
    })
    await openMigrationFlow(page)
    await expect(nestedRow(page, child)).toBeVisible({ timeout: 60_000 })
    await runMigrationFlow(page, wallet, { roots: [parent] })
    await assertWrappedChildMigrated(child, HEADLESS_USER_ADDRESS, {
      locked: true,
    })
    await expectRecordsResolve(child, records)
    await waitForBignameBlock()

    await expectProfileShows(page, child, 'locked child carried over')
  })
})
