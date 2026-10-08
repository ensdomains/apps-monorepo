/**
 * ENS V1 → V2 migration of locked .eth 2LDs, one owner fuse at a time (§G.GW).
 *
 * A locked 2LD (CANNOT_UNWRAP burnt) is not unwrapped. `LockedMigrationController`
 * sends the wrapper token to the Graveyard, deploys a WrapperRegistry as the V2
 * subregistry, and derives every V2 role from the V1 fuses:
 *
 *   token roles (owner)     ROLE_SET_RESOLVER unless CANNOT_SET_RESOLVER
 *                           ROLE_RENEW         if CAN_EXTEND_EXPIRY
 *                           each of those doubled into its _ADMIN unless CANNOT_BURN_FUSES
 *                           ROLE_CAN_TRANSFER_ADMIN unless CANNOT_TRANSFER
 *   root roles (subregistry) RENEW | UPGRADE | CAN_NAME, plus REGISTRAR unless
 *                           CANNOT_CREATE_SUBDOMAIN, doubled into _ADMIN unless
 *                           CANNOT_BURN_FUSES
 *
 * Source: `LockedWrapperReceiver._tokenRoleBitmapFromFuses` /
 * `_subregistryRoleBitmapFromFuses`, and the exhaustive
 * `LockedMigrationFuseMatrix.t.sol` in contracts-v2, which asserts these
 * bitmaps by exact equality. So do these tests: a subset check cannot catch an
 * over-grant, and an over-grant is the failure that matters.
 *
 * Two fuses make a name unmigratable rather than changing its roles:
 *   - CANNOT_TRANSFER: the NameWrapper refuses the transfer itself
 *     (`test_fuseMatrix_cannotTransfer_alwaysReverts`), so there is no route.
 *   - CANNOT_APPROVE with an outstanding approval: `FrozenTokenApproval`
 *     (`test_cannotApprove_withOutstandingApproval_reverts`).
 *
 * This file replaces the earlier fuse spec, which no config ran. It only asserted
 * "REGISTERED with a subregistry", expected a CANNOT_TRANSFER name to migrate
 * (the chain makes that impossible), and expected the V1 public resolver to
 * survive CANNOT_SET_RESOLVER unchanged (the controller swaps a known public
 * resolver for the V2 one).
 *
 * GW7 and GW8 also need the portal to honour the roles; both are tagged on
 * `projects/portal/tests/migrated-fuses.spec.ts`, which asserts both halves. GW9 (CAN_EXTEND_EXPIRY on a
 * 2LD) is EXEMPT: the fuse is parent-controlled and a .eth 2LD can never carry
 * it (`test_wrappedETH2LD_neverHasCanExtendExpiry`).
 */
import { ensL1Contracts, supportedL1Chains } from '@ensdomains/ensjs/chain'
import { registryRoles } from '@ensdomains/ensjs/utils/v2'
import type { Page } from '@playwright/test'
import {
  type Address,
  encodeAbiParameters,
  encodeFunctionData,
  namehash,
  parseAbi,
  zeroAddress,
} from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import {
  createMakeV1Name,
  FUSES,
  V1_NAME_WRAPPER,
  V1_PUBLIC_RESOLVER,
} from '../../../fixtures/makeV1Name.js'
import { expect, test } from '../../../fixtures/playwright.manager.fixture.js'
import { publicClient, walletClient } from '../../../helpers/anvil-client.js'
import {
  assertLockedTokenRoute,
  assertV2Reserved,
  assertV2Resolver,
  expectedKeptResolver,
  readLockedMigrationRoles,
} from '../../../helpers/migration-assertions.js'
import {
  confirmAndAuthorize,
  openMigrationFlow,
  rootRow,
  selectOnlyRoots,
} from '../../../helpers/migration-flow.js'
import { mockV1Subgraph } from '../../../helpers/mock-v1-subgraph.js'

// Headless wallet user = Anvil account 0
const HEADLESS_USER_ADDRESS = privateKeyToAccount(
  '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
).address

const {
  ROLE_CAN_TRANSFER_ADMIN,
  ROLE_REGISTRAR,
  ROLE_RENEW,
  ROLE_SET_RESOLVER,
  ROLE_SET_RESOLVER_ADMIN,
  ROLE_UPGRADE,
  ROLE_WAS_RESERVED,
} = registryRoles

const ADMIN_SHIFT = 128n

/**
 * `RegistryRolesLib.ROLE_CAN_NAME` (nybble 30). ensjs's `registryRoles` does
 * not export it, so it is the one constant restated here.
 */
const CAN_NAME = 1n << 120n

const NAME_WRAPPER_ABI = parseAbi([
  'function approve(address to, uint256 tokenId)',
  'function getApproved(uint256 tokenId) view returns (address)',
  'function setFuses(bytes32 node, uint16 ownerControlledFuses) returns (uint32)',
  'function ownerOf(uint256 id) view returns (address)',
  'function setResolver(bytes32 node, address resolver)',
  'function safeTransferFrom(address from, address to, uint256 id, uint256 amount, bytes data)',
])

const LOCKED_MIGRATION_CONTROLLER = ensL1Contracts[supportedL1Chains.sepolia]
  .ensLockedMigrationController.address as Address

/**
 * A V1 resolver `PublicResolverSet` certifies on Sepolia (live and fork,
 * checked 2026-10-08). The fixture default, `V1_PUBLIC_RESOLVER`
 * (`0x8FADE66B…`), is NOT certified — see the uncertified-resolver test.
 */
const CERTIFIED_V1_RESOLVER =
  '0xE99638b40E4Fff0129D56f03b55b6bbC4BBE49b5' as Address

const hex = (bitmap: bigint) => `0x${bitmap.toString(16)}`

const labelOf = (name: string) => name.replace(/\.eth$/, '')

/**
 * Seed a locked 2LD with `fuses` burnt on top of CANNOT_UNWRAP, and return the
 * name plus everything the oracles need.
 */
async function seedLocked(
  accounts: { getPrivateKey: (who: 'user') => `0x${string}` },
  label: string,
  fuses = 0,
) {
  const userAccount = privateKeyToAccount(accounts.getPrivateKey('user'))
  const makeV1Name = createMakeV1Name({ userAccount })
  const name = await makeV1Name({ label, type: 'locked', fuses })
  return { name, label: labelOf(name), node: namehash(name), userAccount }
}

/** Mock the subgraph with locked 2LDs carrying their real owner fuses. */
async function mockLocked(
  page: Page,
  names: readonly { name: string; fuses: number; resolver?: Address }[],
) {
  await mockV1Subgraph(page, {
    ownerAddress: HEADLESS_USER_ADDRESS,
    roots: names.map(({ name, fuses, resolver }) => ({
      kind: 'registration' as const,
      label: labelOf(name),
      type: 'locked' as const,
      ownerFuses: FUSES.CANNOT_UNWRAP | fuses,
      ...(resolver ? { resolver } : {}),
    })),
  })
}

/** Send setup transactions from the name's owner, one after another. */
async function sendAsOwner(
  account: ReturnType<typeof privateKeyToAccount>,
  calls: readonly `0x${string}`[],
) {
  for (const data of calls) {
    const hash = await walletClient.sendTransaction({
      account,
      to: V1_NAME_WRAPPER,
      data,
    })
    const receipt = await publicClient.waitForTransactionReceipt({ hash })
    expect(receipt.status, 'setup transaction reverted').toBe('success')
  }
}

/**
 * Whether the NameWrapper would let the owner hand `node` to the locked
 * migration controller — the transfer the app's batch makes. Simulated only,
 * so nothing lands. The NameWrapper's ERC-1155 receiver check swallows the
 * controller's custom error, so a refusal is a bare revert; comparing against
 * a control name in the same state minus one fuse is what pins the cause.
 */
async function controllerAcceptsTransfer(
  owner: Address,
  name: string,
  node: `0x${string}`,
): Promise<boolean> {
  const data = encodeAbiParameters(
    [
      {
        type: 'tuple',
        components: [
          { name: 'label', type: 'string' },
          { name: 'owner', type: 'address' },
          { name: 'subregistry', type: 'address' },
          { name: 'resolver', type: 'address' },
        ],
      },
    ],
    [
      {
        label: labelOf(name),
        owner,
        subregistry: zeroAddress,
        resolver: zeroAddress,
      },
    ],
  )
  try {
    await publicClient.simulateContract({
      account: owner,
      address: V1_NAME_WRAPPER,
      abi: NAME_WRAPPER_ABI,
      functionName: 'safeTransferFrom',
      args: [owner, LOCKED_MIGRATION_CONTROLLER, BigInt(node), 1n, data],
    })
    return true
  } catch {
    return false
  }
}

async function migrateOnly(
  page: Page,
  wallet: Parameters<typeof confirmAndAuthorize>[1],
  name: string,
) {
  await openMigrationFlow(page)
  await expect(rootRow(page, name)).toBeVisible({ timeout: 30_000 })
  await selectOnlyRoots(page, [name])
  await confirmAndAuthorize(page, wallet)
}

async function expectRoles(
  label: string,
  expected: { token: bigint; root: bigint },
) {
  const { owner, tokenRoles, rootRoles } = await readLockedMigrationRoles(label)
  expect(owner, `${label}.eth has no V2 owner`).not.toBe(zeroAddress)
  // Every migrated name is registered out of the RESERVED state, and
  // `PermissionedRegistry._register` tags such a token with ROLE_WAS_RESERVED
  // ("token only, not revokable"). It is not part of the fuse mapping, so it
  // is added here rather than to each expectation.
  expect(hex(tokenRoles), `token roles of ${owner} on ${label}.eth`).toBe(
    hex(expected.token | ROLE_WAS_RESERVED),
  )
  expect(hex(rootRoles), `root roles on ${label}.eth's WrapperRegistry`).toBe(
    hex(expected.root),
  )
}

/**
 * A name that cannot migrate must be named as such on the selection screen —
 * not silently left out (INV3 totality: every input lands in a visible
 * bucket). The control name proves the mock reached the app, so an absent row
 * means the app dropped it, not that the mock failed.
 */
async function expectSurfacedAsIneligible(
  page: Page,
  options: { control: string; ineligible: string; reason: RegExp },
) {
  await openMigrationFlow(page)
  await expect(
    rootRow(page, options.control),
    `control ${options.control} is missing, so the mock did not reach the app`,
  ).toBeVisible({ timeout: 30_000 })

  await expect(
    rootRow(page, options.ineligible),
    `${options.ineligible} cannot migrate and must not be selectable`,
  ).toHaveCount(0)
  await expect(
    page.getByText(options.ineligible, { exact: true }),
    `${options.ineligible} is silently dropped from the upgrade list instead of being shown as ineligible`,
  ).toBeVisible()
  await expect(
    page.getByText(options.reason).first(),
    `the upgrade list does not say why ${options.ineligible} cannot be upgraded`,
  ).toBeVisible()
}

// Expected bitmaps, built from ensjs's role constants (rule: never hand-roll).
const BASE_TOKEN =
  ROLE_SET_RESOLVER | ROLE_SET_RESOLVER_ADMIN | ROLE_CAN_TRANSFER_ADMIN
const ROOT_USER = ROLE_REGISTRAR | ROLE_RENEW | ROLE_UPGRADE | CAN_NAME
const BASE_ROOT = ROOT_USER | (ROOT_USER << ADMIN_SHIFT)

test.describe('ENS V1 → V2 migration — locked 2LD fuses (§G.GW)', () => {
  test.describe.configure({ timeout: 300_000 })

  test('a locked 2LD keeps its wrapper in the Graveyard, gains a WrapperRegistry, and the exact base roles', {
    tag: ['@scenario:GW3'],
  }, async ({ migrationConnectedPage: page, wallet, accounts }) => {
    const { name, label, node } = await seedLocked(accounts, 'gw3-locked')
    await assertV2Reserved(label)

    await mockLocked(page, [{ name, fuses: 0 }])
    await migrateOnly(page, wallet, name)

    await assertLockedTokenRoute(label, node)
    await expectRoles(label, { token: BASE_TOKEN, root: BASE_ROOT })
  })

  test('CANNOT_TRANSFER: never offered for upgrade, and shown as not transferable', {
    tag: ['@scenario:GW5'],
  }, async ({ migrationConnectedPage: page, accounts }) => {
    test.fail(
      true,
      'E2E-020: a name that can never migrate is silently left off the upgrade list, with no reason shown',
    )
    const control = await seedLocked(accounts, 'gw5-control')
    const frozen = await seedLocked(
      accounts,
      'gw5-cannot-transfer',
      FUSES.CANNOT_TRANSFER,
    )

    await mockLocked(page, [
      { name: control.name, fuses: 0 },
      { name: frozen.name, fuses: FUSES.CANNOT_TRANSFER },
    ])
    await expectSurfacedAsIneligible(page, {
      control: control.name,
      ineligible: frozen.name,
      reason: /transfer/i,
    })
    await assertV2Reserved(frozen.label)
  })

  test('CANNOT_SET_RESOLVER: a certified V1 resolver is replaced by the V2 PublicResolver, and no resolver role is granted', {
    tag: ['@scenario:GW6'],
  }, async ({ migrationConnectedPage: page, wallet, accounts }) => {
    const { name, label, node, userAccount } = await seedLocked(
      accounts,
      'gw6-no-resolver',
    )
    // Point the name at a resolver PublicResolverSet certifies, then freeze it.
    await sendAsOwner(userAccount, [
      encodeFunctionData({
        abi: NAME_WRAPPER_ABI,
        functionName: 'setResolver',
        args: [node, CERTIFIED_V1_RESOLVER],
      }),
      encodeFunctionData({
        abi: NAME_WRAPPER_ABI,
        functionName: 'setFuses',
        args: [node, FUSES.CANNOT_SET_RESOLVER],
      }),
    ])

    await mockLocked(page, [
      {
        name,
        fuses: FUSES.CANNOT_SET_RESOLVER,
        resolver: CERTIFIED_V1_RESOLVER,
      },
    ])
    await migrateOnly(page, wallet, name)

    await assertLockedTokenRoute(label, node)
    // The name keeps its resolver *choice*: the controller ignores the app's
    // resolver and carries the V1 one across, swapping a certified public
    // resolver for its V2 counterpart (`LockedWrapperReceiver`, the
    // CANNOT_SET_RESOLVER branch).
    const kept = await expectedKeptResolver(CERTIFIED_V1_RESOLVER)
    expect(kept.toLowerCase()).not.toBe(CERTIFIED_V1_RESOLVER.toLowerCase())
    await assertV2Resolver(label, kept)
    // No SET_RESOLVER and so nothing to double into an admin role: only
    // transferability is left on the token.
    await expectRoles(label, {
      token: ROLE_CAN_TRANSFER_ADMIN,
      root: BASE_ROOT,
    })
  })

  test('CANNOT_SET_RESOLVER with an uncertified V1 resolver: refused before the wallet is asked for anything', {
    tag: ['@scenario:GW6'],
  }, async ({ migrationConnectedPage: page, accounts }) => {
    // The fixture default resolver, which PublicResolverSet does not certify.
    // The controller would carry it into V2 unchanged, so the app refuses
    // instead (`assertLockedPublicResolverSetMembership`).
    const { name, label } = await seedLocked(
      accounts,
      'gw6-uncertified',
      FUSES.CANNOT_SET_RESOLVER,
    )
    await mockLocked(page, [
      {
        name,
        fuses: FUSES.CANNOT_SET_RESOLVER,
        resolver: V1_PUBLIC_RESOLVER as Address,
      },
    ])
    await openMigrationFlow(page)
    await expect(rootRow(page, name)).toBeVisible({ timeout: 30_000 })
    await selectOnlyRoots(page, [name])

    await expect(
      page.getByText(/upgrade contracts don.t match this account/i),
    ).toBeVisible({ timeout: 60_000 })
    await expect(
      page.getByRole('button', { name: /^Upgrade \d+ names?$/ }),
    ).toBeDisabled()
    await assertV2Reserved(label)
  })

  // GW7's full oracle (this bitmap plus the portal hiding grant/revoke) is
  // `projects/portal/tests/migrated-fuses.spec.ts`, currently E2E-021; this is
  // the UI-driven half, kept as a regression guard on the manager's batch.
  test('CANNOT_BURN_FUSES: no admin role on the token except transfer, none at all on the subregistry', async ({
    migrationConnectedPage: page,
    wallet,
    accounts,
  }) => {
    const { name, label, node } = await seedLocked(
      accounts,
      'gw7-frozen',
      FUSES.CANNOT_BURN_FUSES,
    )

    await mockLocked(page, [{ name, fuses: FUSES.CANNOT_BURN_FUSES }])
    await migrateOnly(page, wallet, name)

    await assertLockedTokenRoute(label, node)
    await expectRoles(label, {
      token: ROLE_SET_RESOLVER | ROLE_CAN_TRANSFER_ADMIN,
      root: ROOT_USER,
    })
  })

  // GW8's full oracle (this bitmap plus the portal withholding "Create
  // subname") is `projects/portal/tests/migrated-fuses.spec.ts`; this is the
  // UI-driven half, kept as a regression guard on the manager's batch.
  test('CANNOT_CREATE_SUBDOMAIN: the subregistry grants no ROLE_REGISTRAR, everything else unchanged', async ({
    migrationConnectedPage: page,
    wallet,
    accounts,
  }) => {
    const { name, label, node } = await seedLocked(
      accounts,
      'gw8-no-subdomain',
      FUSES.CANNOT_CREATE_SUBDOMAIN,
    )

    await mockLocked(page, [{ name, fuses: FUSES.CANNOT_CREATE_SUBDOMAIN }])
    await migrateOnly(page, wallet, name)

    await assertLockedTokenRoute(label, node)
    const rootUser = ROOT_USER & ~ROLE_REGISTRAR
    await expectRoles(label, {
      token: BASE_TOKEN,
      root: rootUser | (rootUser << ADMIN_SHIFT),
    })
  })

  test('CANNOT_SET_TTL: dropped — the roles are exactly those of a plain locked name', {
    tag: ['@scenario:GW10'],
  }, async ({ migrationConnectedPage: page, wallet, accounts }) => {
    const { name, label, node } = await seedLocked(
      accounts,
      'gw10-no-ttl',
      FUSES.CANNOT_SET_TTL,
    )

    await mockLocked(page, [{ name, fuses: FUSES.CANNOT_SET_TTL }])
    await migrateOnly(page, wallet, name)

    await assertLockedTokenRoute(label, node)
    await expectRoles(label, { token: BASE_TOKEN, root: BASE_ROOT })
  })

  test('CANNOT_APPROVE with an outstanding approval: the chain refuses the transfer, and the app never offers the name', {
    tag: ['@scenario:GW11'],
  }, async ({ migrationConnectedPage: page, accounts }) => {
    const control = await seedLocked(accounts, 'gw11-control')
    const frozen = await seedLocked(accounts, 'gw11-frozen-approval')
    const owner = privateKeyToAccount(accounts.getPrivateKey('user')).address

    // Approve someone, then freeze that approval. This is the only state in
    // which `FrozenTokenApproval` can fire. The control gets the same
    // approval without the fuse.
    const approvee = accounts.getAddress('user2')
    for (const target of [control, frozen]) {
      await sendAsOwner(target.userAccount, [
        encodeFunctionData({
          abi: NAME_WRAPPER_ABI,
          functionName: 'approve',
          args: [approvee, BigInt(target.node)],
        }),
      ])
    }
    await sendAsOwner(frozen.userAccount, [
      encodeFunctionData({
        abi: NAME_WRAPPER_ABI,
        functionName: 'setFuses',
        args: [frozen.node, FUSES.CANNOT_APPROVE],
      }),
    ])
    const approved = await publicClient.readContract({
      address: V1_NAME_WRAPPER,
      abi: NAME_WRAPPER_ABI,
      functionName: 'getApproved',
      args: [BigInt(frozen.node)],
    })
    expect(approved.toLowerCase()).toBe(approvee.toLowerCase())

    // The chain's answer, which the INV3 dead-reason site asks for: the
    // controller refuses the frozen approval and accepts the control.
    expect(
      await controllerAcceptsTransfer(owner, control.name, control.node),
      'control: an approval without CANNOT_APPROVE must not block migration',
    ).toBe(true)
    expect(
      await controllerAcceptsTransfer(owner, frozen.name, frozen.node),
      'a frozen outstanding approval must make the controller refuse the name',
    ).toBe(false)

    // The app's answer: it withholds the name rather than offering a
    // migration the chain will refuse.
    await mockLocked(page, [
      { name: control.name, fuses: 0 },
      { name: frozen.name, fuses: FUSES.CANNOT_APPROVE },
    ])
    await openMigrationFlow(page)
    await expect(
      rootRow(page, control.name),
      `control ${control.name} is missing, so the mock did not reach the app`,
    ).toBeVisible({ timeout: 30_000 })
    await expect(
      rootRow(page, frozen.name),
      `${frozen.name} can never migrate and must not be offered`,
    ).toHaveCount(0)
    await assertV2Reserved(frozen.label)
  })

  test('all owner fuses burnt: never offered, and the reason names the transfer fuse', {
    tag: ['@scenario:GW12'],
  }, async ({ migrationConnectedPage: page, accounts }) => {
    test.fail(
      true,
      'E2E-020: a name that can never migrate is silently left off the upgrade list, with no reason shown',
    )
    const ALL =
      FUSES.CANNOT_BURN_FUSES |
      FUSES.CANNOT_TRANSFER |
      FUSES.CANNOT_SET_RESOLVER |
      FUSES.CANNOT_SET_TTL |
      FUSES.CANNOT_CREATE_SUBDOMAIN |
      FUSES.CANNOT_APPROVE
    const control = await seedLocked(accounts, 'gw12-control')
    const frozen = await seedLocked(accounts, 'gw12-all-fuses', ALL)

    await mockLocked(page, [
      { name: control.name, fuses: 0 },
      { name: frozen.name, fuses: ALL },
    ])
    await expectSurfacedAsIneligible(page, {
      control: control.name,
      ineligible: frozen.name,
      reason: /transfer/i,
    })
    await assertV2Reserved(frozen.label)
  })
})
