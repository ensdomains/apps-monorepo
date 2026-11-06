import type { Page } from '@playwright/test'
import {
  type Address,
  encodeAbiParameters,
  encodeFunctionData,
  type Hex,
  keccak256,
  labelhash,
  namehash,
  parseAbi,
  toHex,
  zeroAddress,
} from 'viem'
import { privateKeyToAccount } from 'viem/accounts'

import {
  createMakeV1Name,
  PREMIGRATION_BONUS,
  V1_ENS_REGISTRY,
  V1_NAME_WRAPPER,
  V1_PUBLIC_RESOLVER,
} from '../../../fixtures/makeV1Name.js'
import { wrapV1SubnameOfUnwrapped } from '../../../fixtures/makeV1Subname.js'
import { expect, test } from '../../../fixtures/playwright.manager.fixture.js'
import {
  cloneV1PublicResolver,
  setV1RecordsOn,
} from '../../../fixtures/v1-records.js'
import { splitController } from '../../../fixtures/v1-tails.js'
import { publicClient, testClient } from '../../../helpers/anvil-client.js'
import { authorizeTransactionsWhile } from '../../../helpers/manager-auth.js'
import {
  assertCopyResolver,
  assertNoUserRegistry,
  assertUserRegistryAttached,
  assertV2Registered,
  assertV2Reserved,
  MAX_UINT64,
} from '../../../helpers/migration-assertions.js'
import {
  confirmAndAuthorize,
  openMigrationFlow,
  readPlan,
  rootRow,
  selectOnlyRoots,
  upgradeAndSettle,
} from '../../../helpers/migration-flow.js'
import { mockSubnameInventory } from '../../../helpers/mock-subname-inventory.js'
import {
  asPlainEoas,
  connectWithFlags,
  recreateTree,
  registryChild,
  type Signer,
  send,
} from '../../../helpers/recreation.js'
import {
  dnsEncode,
  expectRecordsResolve,
} from '../../../helpers/resolve-records.js'
import { serveV1Names } from '../../../helpers/v1-names.js'
import {
  ethRegistryState,
  hcaOf,
  labelId,
  predictUserRegistry,
  RECORD_SETTER_ROLES,
  REGISTRY_ABI,
  ROLE_SET_RESOLVER,
  ROLES_ALL,
  ROOT_RESOURCE,
  registryState,
  roleHolders,
  rolesOf,
  V2_ETH_REGISTRY,
  v1Expiry,
} from '../../../helpers/v2-reads.js'

const RESERVATION_BONUSES = [
  {
    title: 'V1 + 62 days (initial premigration)',
    bonus: PREMIGRATION_BONUS,
    tag: 'r2-62d',
  },
  {
    title: 'V1 + 62 days + 1 s (ETHRenewerV1)',
    bonus: PREMIGRATION_BONUS + 1n,
    tag: 'r2-62d1s',
  },
] as const

test.describe('#1494 flag off: plain 2LD migration (R2)', () => {
  test.describe.configure({ timeout: 300_000 })

  for (const { title, bonus, tag } of RESERVATION_BONUSES)
    test(`an unwrapped 2LD reserved at ${title} migrates and keeps that exact expiry`, async ({
      page,
      wallet,
      accounts,
    }) => {
      const user = privateKeyToAccount(accounts.getPrivateKey('user'))
      const makeV1Name = createMakeV1Name({ userAccount: user })
      const name = await makeV1Name({ label: tag, reservationBonus: bonus })
      const label = name.replace(/\.eth$/, '')
      const reserved = await ethRegistryState(label)

      await serveV1Names(page, [
        {
          name,
          ownerAddress: user.address,
          expiryDate: await v1Expiry(label),
        },
      ])
      await mockSubnameInventory(page, [{ name }])
      await connectWithFlags(page, wallet, { recreation: false })

      await openMigrationFlow(page)
      await selectOnlyRoots(page, [name])
      await confirmAndAuthorize(page, wallet)

      await assertV2Registered(label)
      const after = await ethRegistryState(label)
      expect(after.latestOwner.toLowerCase()).toBe(user.address.toLowerCase())
      expect(after.expiry, 'the reservation expiry is preserved exactly').toBe(
        reserved.expiry,
      )
      await assertNoUserRegistry(name)
    })
})

test.describe('#1494 WEB-1934 flag on: direct 3LD recreation', () => {
  test.describe.configure({ timeout: 420_000 })

  test('recreates every direct child for its own V1 holder with token ALL, maxUint64 and its exact resolver', async ({
    page,
    wallet,
    accounts,
  }) => {
    const owner = privateKeyToAccount(accounts.getPrivateKey('user'))
    const bob = privateKeyToAccount(accounts.getPrivateKey('user2'))
    const carol = privateKeyToAccount(accounts.getPrivateKey('user3'))
    await asPlainEoas(bob, carol)
    const makeV1Name = createMakeV1Name({ userAccount: owner })

    const parentRecords = {
      texts: [{ key: 'description', value: 'web1934 parent' }],
    }
    const parent = await makeV1Name({
      label: 'w1934',
      records: parentRecords,
    })
    const parentLabel = parent.replace(/\.eth$/, '')

    // bob: registry-only, held by another wallet, records on the V1 public resolver.
    const bobRecords = {
      texts: [{ key: 'description', value: 'bob keeps this' }],
    }
    const bobName = await registryChild({
      parent,
      label: 'bob',
      parentOwner: owner,
      holder: bob,
      records: bobRecords,
    })
    // carol: wrapped with zero fuses, held by a third wallet, on a custom resolver.
    const custom = await cloneV1PublicResolver()
    const carolName = await wrapV1SubnameOfUnwrapped({
      parentLabel,
      childLabel: 'carol',
      parentOwnerAccount: owner,
      ownerAccount: carol,
    })
    await setV1RecordsOn(
      carolName,
      carol,
      true,
      { texts: [{ key: 'url', value: 'https://carol.example' }] },
      { resolver: custom },
    )
    // zed: registry-only, the parent owner's own, with no resolver at all.
    const zedName = await registryChild({
      parent,
      label: 'zed',
      parentOwner: owner,
      holder: owner,
    })

    await serveV1Names(page, [
      {
        name: parent,
        ownerAddress: owner.address,
        expiryDate: await v1Expiry(parentLabel),
        records: parentRecords,
      },
    ])
    await mockSubnameInventory(page, [
      {
        name: parent,
        children: [{ name: bobName }, { name: carolName }, { name: zedName }],
      },
    ])
    await connectWithFlags(page, wallet, { recreation: true })

    await openMigrationFlow(page)
    await expect(rootRow(page, parent)).toBeVisible({ timeout: 60_000 })
    await selectOnlyRoots(page, [parent])
    await page.waitForTimeout(5_000)

    await confirmAndAuthorize(page, wallet)

    // ── Parent: REGISTERED to the owner, with a certified UserRegistry ──
    await assertV2Registered(parentLabel)
    const registry = await assertUserRegistryAttached(parent)

    // Root roles: the owner wallet and its HCA hold ALL, nobody else holds anything.
    const hca = await hcaOf(owner.address)
    const rootHolders = await roleHolders(registry, ROOT_RESOURCE)
    expect(Object.fromEntries(rootHolders)).toEqual({
      [owner.address.toLowerCase()]: ROLES_ALL,
      [hca.toLowerCase()]: ROLES_ALL,
    })

    // ── Children: holder, token roles, expiry, resolver ──
    const expected = [
      { name: bobName, holder: bob.address, resolver: V1_PUBLIC_RESOLVER },
      { name: carolName, holder: carol.address, resolver: custom },
      { name: zedName, holder: owner.address, resolver: zeroAddress },
    ]
    for (const child of expected) {
      const label = child.name.split('.')[0] ?? ''
      const state = await registryState(registry, label)
      expect(state.status, `${child.name} is REGISTERED`).toBe(2)
      expect(state.latestOwner.toLowerCase(), `${child.name} holder`).toBe(
        child.holder.toLowerCase(),
      )
      expect(state.expiry, `${child.name} expiry`).toBe(MAX_UINT64)
      expect(
        Object.fromEntries(await roleHolders(registry, state.resource)),
        `${child.name}: only its holder has token roles, and they are ALL`,
      ).toEqual({ [child.holder.toLowerCase()]: ROLES_ALL })
      await assertCopyResolver(child.name, child.resolver)
    }

    // ── Records: still served from the kept V1 resolvers through V2 ──
    await expectRecordsResolve(bobName, bobRecords)
    await expectRecordsResolve(parent, parentRecords)
  })
})

// ---------------------------------------------------------------------------
// WEB-1933: parents whose subnames cannot be preserved stay on ENSv1
// ---------------------------------------------------------------------------

/** A childless 2LD every block test offers next to its blocked parents. */
async function controlName(owner: Signer, tag: string) {
  const name = await createMakeV1Name({ userAccount: owner })({ label: tag })
  return {
    name,
    entry: {
      name,
      ownerAddress: owner.address,
      expiryDate: await v1Expiry(name.replace(/\.eth$/, '')),
    },
  }
}

/** Every way a blocked parent can still be picked: its own checkbox, and select-all. */
async function expectNotSelectable(page: Page, parent: string) {
  const row = rootRow(page, parent)
  if ((await row.count()) === 0) return
  await row
    .locator('xpath=..')
    .click({ force: true, timeout: 5_000 })
    .catch(() => {})
  await expect(row, `${parent} must not become selected`).not.toBeChecked()
}

test.describe('#1494 WEB-1933 flag off: a parent with subnames stays on ENSv1', () => {
  test.describe.configure({ timeout: 300_000 })

  test('the parent is disabled with its reason while a childless name upgrades', async ({
    page,
    wallet,
    accounts,
  }) => {
    const owner = privateKeyToAccount(accounts.getPrivateKey('user'))
    const other = privateKeyToAccount(accounts.getPrivateKey('user2'))
    await asPlainEoas(other)
    const parent = await createMakeV1Name({ userAccount: owner })({
      label: 'w1933-off',
    })
    const child = await registryChild({
      parent,
      label: 'kid',
      parentOwner: owner,
      holder: other,
    })
    const control = await controlName(owner, 'w1933-ctl')

    await serveV1Names(page, [
      {
        name: parent,
        ownerAddress: owner.address,
        expiryDate: await v1Expiry(parent.replace(/\.eth$/, '')),
      },
      control.entry,
    ])
    await mockSubnameInventory(page, [
      { name: parent, children: [{ name: child }] },
      { name: control.name },
    ])
    await connectWithFlags(page, wallet, { recreation: false })

    await openMigrationFlow(page)
    await expect(rootRow(page, control.name)).toBeVisible({ timeout: 60_000 })
    await expect(page.getByText(parent).first()).toBeVisible()
    await page.waitForTimeout(5_000)
    await expect(
      page
        .getByText(
          'Subname copying is not available in this session. Keep this parent on ENSv1 so its subnames keep working.',
        )
        .first(),
    ).toBeVisible()
    await expectNotSelectable(page, parent)

    await selectOnlyRoots(page, [control.name])
    await confirmAndAuthorize(page, wallet)

    await assertV2Registered(control.name.replace(/\.eth$/, ''))
    await assertV2Reserved(parent.replace(/\.eth$/, ''))
  })
})

test.describe('#1494 WEB-1933 flag on: unsupported trees cannot be selected', () => {
  test.describe.configure({ timeout: 300_000 })

  test('4LD trees and incomplete inventories block their parent; a childless name still upgrades', async ({
    page,
    wallet,
    accounts,
  }) => {
    const owner = privateKeyToAccount(accounts.getPrivateKey('user'))
    const other = privateKeyToAccount(accounts.getPrivateKey('user2'))
    await asPlainEoas(other)
    const makeV1Name = createMakeV1Name({ userAccount: owner })

    // A 3LD with a child of its own: the tree is four levels deep.
    const deep = await makeV1Name({ label: 'w1933-4ld' })
    const deepChild = await registryChild({
      parent: deep,
      label: 'mid',
      parentOwner: owner,
      holder: other,
    })
    const grandchild = await registryChild({
      parent: deepChild,
      label: 'leaf',
      parentOwner: other,
      holder: other,
    })
    // A complete-looking tree, served from an index mid-backfill.
    const partial = await makeV1Name({ label: 'w1933-part' })
    const partialChild = await registryChild({
      parent: partial,
      label: 'kid',
      parentOwner: owner,
      holder: owner,
    })
    const control = await controlName(owner, 'w1933-ctl2')

    const entry = async (name: string) => ({
      name,
      ownerAddress: owner.address,
      expiryDate: await v1Expiry(name.replace(/\.eth$/, '')),
    })
    await serveV1Names(page, [
      await entry(deep),
      await entry(partial),
      control.entry,
    ])
    await mockSubnameInventory(page, [
      {
        name: deep,
        children: [{ name: deepChild, children: [{ name: grandchild }] }],
      },
      { name: control.name },
    ])
    await mockSubnameInventory(
      page,
      [{ name: partial, children: [{ name: partialChild }] }],
      { partial: true },
    )
    await connectWithFlags(page, wallet, { recreation: true })

    await openMigrationFlow(page)
    await expect(rootRow(page, control.name)).toBeVisible({ timeout: 60_000 })
    await page.waitForTimeout(8_000)

    await expect(
      page
        .getByText(
          'This name has subnames with further subnames below them. Upgrading the whole tree is not supported yet.',
        )
        .first(),
    ).toBeVisible()
    await expect(
      page
        .getByText(
          "We could not verify a complete, current list of this name's subnames. Refresh and try again.",
        )
        .first(),
    ).toBeVisible()
    await expectNotSelectable(page, deep)
    await expectNotSelectable(page, partial)

    await selectOnlyRoots(page, [control.name])
    await confirmAndAuthorize(page, wallet)
    await assertV2Registered(control.name.replace(/\.eth$/, ''))
    await assertV2Reserved(deep.replace(/\.eth$/, ''))
    await assertV2Reserved(partial.replace(/\.eth$/, ''))
  })
})

// ---------------------------------------------------------------------------
// R1: an unmigrated V1 name's profile still shows its V1 records
// ---------------------------------------------------------------------------

test.describe('#1494 R1: RESERVED V1 profile reads', () => {
  test.describe.configure({ timeout: 240_000 })

  test('a RESERVED name behind the ENSIP-10-only ENSv1 resolver shows its V1 records', async ({
    page,
    wallet,
    accounts,
  }) => {
    const owner = privateKeyToAccount(accounts.getPrivateKey('user'))
    const records = {
      texts: [
        { key: 'description', value: 'r1 still reads from v1' },
        { key: 'url', value: 'https://r1.example' },
      ],
    }
    const name = await createMakeV1Name({ userAccount: owner })({
      label: 'r1-profile',
      records,
    })
    const label = name.replace(/\.eth$/, '')
    expect((await ethRegistryState(label)).status, 'still RESERVED').toBe(1)

    await serveV1Names(page, [
      {
        name,
        ownerAddress: owner.address,
        expiryDate: await v1Expiry(label),
        records,
      },
    ])
    await mockSubnameInventory(page, [{ name }])
    await connectWithFlags(page, wallet, { recreation: false })

    await page.goto(`/p/${name}`)
    await expect(page.getByRole('heading', { name, level: 1 })).toBeVisible({
      timeout: 60_000,
    })
    await expect(page.getByText('r1 still reads from v1')).toBeVisible({
      timeout: 30_000,
    })
    await expect(
      page.locator('main a[href="https://r1.example"]').first(),
    ).toBeVisible()
  })
})

// ---------------------------------------------------------------------------
// WEB-1938: a kept V1 manager on its isolated resolver
// ---------------------------------------------------------------------------

const PERMISSIONED_RESOLVER_ABI = parseAbi([
  'function setText(bytes name, string key, string value)',
  'function linkToRecord(bytes name, uint256 recordId)',
])
/** `TransferUnsafeWithMultipleAssignees(uint256,address)`. */
const TRANSFER_UNSAFE_WITH_MULTIPLE_ASSIGNEES = '0x677f1c18'

async function revertData(call: Promise<unknown>): Promise<string> {
  try {
    await call
    return 'no revert'
  } catch (error) {
    const walk = (e: unknown): string | undefined => {
      if (!e || typeof e !== 'object') return undefined
      const data = (e as { data?: unknown }).data
      if (typeof data === 'string' && data.startsWith('0x')) return data
      return walk((e as { cause?: unknown }).cause)
    }
    return walk(error) ?? (error as Error).message.split('\n')[0] ?? 'revert'
  }
}

test.describe('#1494 WEB-1938 kept manager', () => {
  test.describe.configure({ timeout: 300_000 })

  test('the manager gets SET_RESOLVER and record setters on an isolated resolver, nothing more, and the owner can revoke it', async ({
    page,
    wallet,
    accounts,
  }) => {
    const owner = privateKeyToAccount(accounts.getPrivateKey('user'))
    const manager = privateKeyToAccount(accounts.getPrivateKey('user2'))
    const recipient = privateKeyToAccount(accounts.getPrivateKey('user4'))
    await asPlainEoas(manager, recipient)
    const records = {
      texts: [{ key: 'description', value: 'managed in v1' }],
      addresses: [{ coinType: 60, value: owner.address as Hex }],
    }
    const name = await createMakeV1Name({ userAccount: owner })({
      label: 'w1938-mgr',
      records,
    })
    const label = name.replace(/\.eth$/, '')
    await splitController(name, owner, manager.address)

    await serveV1Names(page, {
      ownerAddress: owner.address,
      roots: [
        {
          kind: 'registration',
          label,
          ownerAddress: manager.address,
          registrantAddress: owner.address,
          expiryDate: await v1Expiry(label),
          records,
        },
      ],
    })
    await mockSubnameInventory(page, [{ name }])
    await connectWithFlags(page, wallet, { recreation: false })

    await openMigrationFlow(page)
    await expect(rootRow(page, name)).toBeVisible({ timeout: 60_000 })
    await selectOnlyRoots(page, [name])
    const optIn = page.getByRole('checkbox', { name: /^Keep .* as a manager/ })
    await expect(optIn).not.toBeChecked()
    await optIn.locator('xpath=..').click()
    await expect(optIn).toBeChecked()
    await confirmAndAuthorize(page, wallet)

    await assertV2Registered(label)
    const state = await ethRegistryState(label)
    expect(state.latestOwner.toLowerCase()).toBe(owner.address.toLowerCase())

    // Registry: the manager holds exactly ROLE_SET_RESOLVER on this name.
    expect(
      await rolesOf(V2_ETH_REGISTRY, state.resource, manager.address),
      'manager token roles on the ETHRegistry',
    ).toBe(ROLE_SET_RESOLVER)

    // Resolver: a resolver only for this name, where the owner and its HCA
    // are the only admins and the manager holds the seven setters.
    const resolver = (await publicClient.readContract({
      address: V2_ETH_REGISTRY,
      abi: REGISTRY_ABI,
      functionName: 'getResolver',
      args: [label],
    })) as Address
    const hca = await hcaOf(owner.address)
    expect(
      Object.fromEntries(await roleHolders(resolver, ROOT_RESOURCE)),
    ).toEqual({
      [owner.address.toLowerCase()]: ROLES_ALL,
      [hca.toLowerCase()]: ROLES_ALL,
      [manager.address.toLowerCase()]: RECORD_SETTER_ROLES,
    })
    await expectRecordsResolve(name, records)

    // The manager can write a record, but cannot relink or clear one.
    await send(
      manager,
      resolver,
      encodeFunctionData({
        abi: PERMISSIONED_RESOLVER_ABI,
        functionName: 'setText',
        args: [dnsEncode(name), 'url', 'https://manager.example'],
      }),
      'manager setText',
    )
    await expectRecordsResolve(name, {
      texts: [{ key: 'url', value: 'https://manager.example' }],
    })
    expect(
      await revertData(
        publicClient.simulateContract({
          account: manager,
          address: resolver,
          abi: PERMISSIONED_RESOLVER_ABI,
          functionName: 'linkToRecord',
          args: [dnsEncode(name), 0n],
        }),
      ),
      'the manager has no ROLE_LINK',
    ).not.toBe('no revert')

    // While the manager holds a token role, a safe transfer is refused.
    const transfer = () =>
      publicClient.simulateContract({
        account: owner,
        address: V2_ETH_REGISTRY,
        abi: REGISTRY_ABI,
        functionName: 'safeTransferFrom',
        args: [owner.address, recipient.address, state.tokenId, 1n, '0x'],
      })
    expect(
      (await revertData(transfer())).slice(0, 10),
      'TransferUnsafeWithMultipleAssignees while the manager holds a role',
    ).toBe(TRANSFER_UNSAFE_WITH_MULTIPLE_ASSIGNEES)

    // The owner can take the role back, after which the transfer is allowed.
    await send(
      owner,
      V2_ETH_REGISTRY,
      encodeFunctionData({
        abi: REGISTRY_ABI,
        functionName: 'revokeRoles',
        args: [state.resource, ROLE_SET_RESOLVER, manager.address],
      }),
      'owner revokeRoles(manager)',
    )
    expect(
      await rolesOf(V2_ETH_REGISTRY, state.resource, manager.address),
    ).toBe(0n)
    const fresh = await ethRegistryState(label)
    expect(
      await revertData(
        publicClient.simulateContract({
          account: owner,
          address: V2_ETH_REGISTRY,
          abi: REGISTRY_ABI,
          functionName: 'safeTransferFrom',
          args: [owner.address, recipient.address, fresh.tokenId, 1n, '0x'],
        }),
      ),
      'the safe transfer is allowed once the manager is revoked',
    ).toBe('no revert')
  })
})

// ---------------------------------------------------------------------------
// WEB-1938: resolver copy / review / replace on a recreated child
// ---------------------------------------------------------------------------

test.describe('#1494 WEB-1938 resolver copy/review/replace', () => {
  test.describe.configure({ timeout: 480_000 })

  test('a populated pubkey blocks replacement; otherwise the reviewed records are verified on the new resolver before the pointer moves', async ({
    page,
    wallet,
    accounts,
    mockBigname,
  }) => {
    const owner = privateKeyToAccount(accounts.getPrivateKey('user'))
    const parent = await createMakeV1Name({ userAccount: owner })({
      label: 'w1938-copy',
    })
    const amyRecords = {
      texts: [{ key: 'description', value: 'amy copies this' }],
      addresses: [{ coinType: 60, value: owner.address as Hex }],
    }
    const amy = await registryChild({
      parent,
      label: 'amy',
      parentOwner: owner,
      holder: owner,
      records: amyRecords,
    })
    const pkRecords = {
      texts: [{ key: 'description', value: 'pk has a pubkey' }],
      pubkey: {
        x: `0x${'11'.repeat(32)}` as Hex,
        y: `0x${'22'.repeat(32)}` as Hex,
      },
    }
    const pk = await registryChild({
      parent,
      label: 'pk',
      parentOwner: owner,
      holder: owner,
      records: pkRecords,
    })

    await serveV1Names(page, [
      {
        name: parent,
        ownerAddress: owner.address,
        expiryDate: await v1Expiry(parent.replace(/\.eth$/, '')),
      },
    ])
    await mockSubnameInventory(page, [
      { name: parent, children: [{ name: amy }, { name: pk }] },
    ])
    await connectWithFlags(page, wallet, { recreation: true })
    await openMigrationFlow(page)
    await selectOnlyRoots(page, [parent])
    await confirmAndAuthorize(page, wallet)
    await assertCopyResolver(amy, V1_PUBLIC_RESOLVER)

    for (const [name, records] of [
      [parent, []],
      [amy, amyRecords.texts],
      [pk, pkRecords.texts],
    ] as const)
      mockBigname.addName({
        name,
        owner: owner.address,
        ...(name !== parent && { resolver: V1_PUBLIC_RESOLVER }),
        records: [...records],
      })

    // ── pk: the V1 pubkey cannot be stored by PermissionedResolver ──
    await page.goto(`/p/${pk}`)
    await expect(page.getByText('pk has a pubkey')).toBeVisible({
      timeout: 120_000,
    })
    await startImport(page)
    const blocked = page.getByRole('alert').filter({
      hasText: 'Resolver replacement is blocked',
    })
    await expect(blocked).toBeVisible()
    await expect(blocked).toContainText('pubkey')
    await expect(reviewCheckbox(page)).toBeDisabled()
    await assertCopyResolver(pk, V1_PUBLIC_RESOLVER)

    // ── amy: copy, review, verify, then switch ──
    await page.goto(`/p/${amy}`)
    await expect(page.getByText('amy copies this')).toBeVisible({
      timeout: 120_000,
    })
    await startImport(page)
    await expect(page.getByRole('alert')).toHaveCount(0)
    await reviewCheckbox(page).check()
    await page.getByRole('button', { name: /^Preview$/i }).click()
    await page.getByRole('button', { name: /^Publish( changes)?$/i }).click()
    const confirm = page.getByRole('button', { name: 'Replace & Save' })
    await expect(confirm).toBeVisible({ timeout: 30_000 })

    const pointer = async () =>
      (
        await publicClient.readContract({
          address: (await assertUserRegistryAttached(parent)) as Address,
          abi: REGISTRY_ABI,
          functionName: 'getResolver',
          args: ['amy'],
        })
      ).toLowerCase()
    let moved = false
    const authorizing = authorizeTransactionsWhile(page, wallet, () => moved)
    await confirm.click()
    await expect
      .poll(pointer, { timeout: 240_000, intervals: [2_000] })
      .not.toBe(V1_PUBLIC_RESOLVER.toLowerCase())
    moved = true
    await authorizing

    const target = (await pointer()) as Address
    // The new resolver is the owner's: the wallet holds ALL at root.
    expect(
      (await roleHolders(target, ROOT_RESOURCE)).get(
        owner.address.toLowerCase(),
      ),
      'the wallet controls the replacement resolver',
    ).toBe(ROLES_ALL)
    // The reviewed records resolve from it, and the old resolver still has them.
    await expectRecordsResolve(amy, amyRecords)
    expect(
      await publicClient.readContract({
        address: V1_PUBLIC_RESOLVER,
        abi: parseAbi([
          'function text(bytes32 node, string key) view returns (string)',
        ]),
        functionName: 'text',
        args: [namehash(amy), 'description'],
      }),
    ).toBe('amy copies this')
    // A sibling is untouched by amy's import.
    await assertCopyResolver(pk, V1_PUBLIC_RESOLVER)
  })
})

/** Open the copy: "Upgrade resolver" when the wallet can still write, else "Copy & edit records". */
async function startImport(page: Page) {
  await page
    .getByRole('button', { name: /^(Upgrade resolver|Copy & edit records)$/i })
    .first()
    .click()
  await expect(page.getByText('Review imported records')).toBeVisible({
    timeout: 120_000,
  })
}

const reviewCheckbox = (page: Page) =>
  page.getByRole('checkbox', {
    name: /I have reviewed the imported records/,
  })

// ---------------------------------------------------------------------------
// Rollout gate: the flag is re-read before anything is submitted
// ---------------------------------------------------------------------------

test.describe('#1494 rollout gate: migration-subname-recreation re-checked before submit', () => {
  test.describe.configure({ timeout: 420_000 })

  test('turning the flag off after a recreation plan is prepared submits nothing', async ({
    page,
    wallet,
    accounts,
  }) => {
    const owner = privateKeyToAccount(accounts.getPrivateKey('user'))
    const other = privateKeyToAccount(accounts.getPrivateKey('user2'))
    await asPlainEoas(other)
    const parent = await createMakeV1Name({ userAccount: owner })({
      label: 'gate-off',
    })
    const child = await registryChild({
      parent,
      label: 'kid',
      parentOwner: owner,
      holder: other,
      resolver: V1_PUBLIC_RESOLVER,
    })
    await serveV1Names(page, [
      {
        name: parent,
        ownerAddress: owner.address,
        expiryDate: await v1Expiry(parent.replace(/\.eth$/, '')),
      },
    ])
    await mockSubnameInventory(page, [
      { name: parent, children: [{ name: child }] },
    ])
    await connectWithFlags(page, wallet, { recreation: true })
    await openMigrationFlow(page)
    await selectOnlyRoots(page, [parent])
    const upgrade = page.getByRole('button', { name: /^Upgrade \d+ names?$/ })
    await expect(upgrade, 'the recreation plan is ready').toBeEnabled({
      timeout: 120_000,
    })

    // Rollout is withdrawn while the page sits on a prepared plan.
    await page.evaluate(() => {
      const posthog = (
        window as Window & {
          posthog?: {
            featureFlags: {
              overrideFeatureFlags(o: { flags: Record<string, boolean> }): void
            }
          }
        }
      ).posthog
      posthog?.featureFlags.overrideFeatureFlags({
        flags: {
          migration: true,
          'profile-view-new': true,
          'migration-subname-recreation': false,
        },
      })
    })

    const from = (await publicClient.getBlockNumber({ cacheTime: 0 })) + 1n
    let done = false
    const authorizing = authorizeTransactionsWhile(page, wallet, () => done)
    if (await upgrade.isEnabled().catch(() => false))
      await upgrade.click({ timeout: 5_000 }).catch(() => {})
    await page.waitForTimeout(30_000)
    done = true
    await Promise.race([authorizing, page.waitForTimeout(5_000)])
    console.log(
      `[gate] page after flip:\n${await page.locator('main').innerText()}`,
    )

    await expect(
      page.getByRole('heading', {
        name: /your names? (has|have) been upgraded/i,
      }),
    ).toHaveCount(0)
    await assertV2Reserved(parent.replace(/\.eth$/, ''))
    const sent = await publicClient.getBlockNumber({ cacheTime: 0 })
    let fromOwner = 0
    for (let n = from; n <= sent; n++) {
      const block = await publicClient.getBlock({
        blockNumber: n,
        includeTransactions: true,
      })
      fromOwner += block.transactions.filter(
        (tx) =>
          typeof tx !== 'string' &&
          tx.from.toLowerCase() === owner.address.toLowerCase(),
      ).length
    }
    expect(fromOwner, 'no wallet transaction after the flag went off').toBe(0)
  })
})

// ---------------------------------------------------------------------------
// #1497 (merged into #1494): ENSv1 names in the primary-name picker
// ---------------------------------------------------------------------------

test.describe('#1494 + #1497 primary name picker offers ENSv1 names', () => {
  test.describe.configure({ timeout: 300_000 })

  test('an unmigrated V1 name is offered; one with no writable resolver is explained, not set up', async ({
    page,
    wallet,
    accounts,
    mockBigname,
  }) => {
    const owner = privateKeyToAccount(accounts.getPrivateKey('user'))
    const makeV1Name = createMakeV1Name({ userAccount: owner })
    const resolving = await makeV1Name({
      label: 'p1497-v1',
      records: { addresses: [{ coinType: 60, value: owner.address as Hex }] },
    })
    const bare = await makeV1Name({ label: 'p1497-bare' })
    for (const name of [resolving, bare])
      mockBigname.addName({
        name,
        owner: owner.address,
        protocol: 'v1',
        ...(name === resolving && { resolver: V1_PUBLIC_RESOLVER }),
      })
    expect(
      (await ethRegistryState(resolving.replace(/\.eth$/, ''))).status,
    ).toBe(1)

    await connectWithFlags(page, wallet, { recreation: false })
    await page.goto('/dashboard')
    await page
      .getByRole('button', { name: /set primary name/i })
      .first()
      .click()

    const pick = (name: string) =>
      page.getByRole('button', { name: `Select ${name} as primary name` })
    await expect(pick(resolving)).toBeVisible({ timeout: 60_000 })
    await expect(pick(bare)).toBeVisible()

    // A V1 name with no resolver this wallet can write cannot be set up from
    // here (setup goes through the V2 registry): the dialog must say so
    // rather than start a resolver setup that cannot complete.
    const before = await publicClient.getBlockNumber({ cacheTime: 0 })
    await pick(bare).click()
    await expect(pick(bare)).toHaveAttribute('aria-pressed', 'true')
    await page.getByRole('button', { name: /^Set as primary$/i }).click()
    await expect(
      page.getByText(
        `${bare} needs a resolver this wallet can write before it can be a primary name`,
      ),
    ).toBeVisible({ timeout: 60_000 })
    expect(
      await publicClient.getBlockNumber({ cacheTime: 0 }),
      'nothing was sent',
    ).toBe(before)
  })
})

// ---------------------------------------------------------------------------
// WEB-1934 acceptance: what each wallet can and cannot do afterwards,
// stale source state, and the explanation's documentation link.
// ---------------------------------------------------------------------------

const USER_REGISTRY_WRITE_ABI = parseAbi([
  'function register(string label, address owner, address registry, address resolver, uint256 roleBitmap, uint64 expiry) returns (uint256)',
  'function unregister(uint256 anyId)',
  'function setResolver(uint256 anyId, address resolver)',
  'function setSubregistry(uint256 anyId, address registry)',
  'function grantRootRoles(uint256 roleBitmap, address account) returns (bool)',
  'function safeTransferFrom(address from, address to, uint256 id, uint256 amount, bytes data)',
  'function unsafeTransfer(address to, uint256 tokenId, bytes data)',
])
/** `TransferUnsafeUntilRegistryIsEmancipated()`: the parent still holds root roles. */
const TRANSFER_UNSAFE_UNTIL_EMANCIPATED = '0x54838f98'

test.describe('#1494 WEB-1934 acceptance: permissions, stale source, docs link', () => {
  test.describe.configure({ timeout: 420_000 })

  test('the child holder controls only its own name; the parent owner can reclaim it and register new ones', async ({
    page,
    wallet,
    accounts,
  }) => {
    const owner = privateKeyToAccount(accounts.getPrivateKey('user'))
    const bob = privateKeyToAccount(accounts.getPrivateKey('user2'))
    const recipient = privateKeyToAccount(accounts.getPrivateKey('user3'))
    await asPlainEoas(bob, recipient)
    const parent = await createMakeV1Name({ userAccount: owner })({
      label: 'w1934-perm',
    })
    const bobName = await registryChild({
      parent,
      label: 'bob',
      parentOwner: owner,
      holder: bob,
      resolver: V1_PUBLIC_RESOLVER,
    })
    const zedName = await registryChild({
      parent,
      label: 'zed',
      parentOwner: owner,
      holder: owner,
      resolver: V1_PUBLIC_RESOLVER,
    })
    await recreateTree({
      page,
      wallet,
      owner,
      parent,
      children: [bobName, zedName],
    })
    const registry = await assertUserRegistryAttached(parent)
    const bobState = await registryState(registry, 'bob')
    const zedState = await registryState(registry, 'zed')

    const sim = (
      account: typeof owner,
      functionName: Parameters<
        typeof encodeFunctionData<typeof USER_REGISTRY_WRITE_ABI>
      >[0]['functionName'],
      args: readonly unknown[],
    ) =>
      revertData(
        publicClient.simulateContract({
          account,
          address: registry,
          abi: USER_REGISTRY_WRITE_ABI,
          functionName,
          args,
        } as never),
      )
    const someResolver = '0x000000000000000000000000000000000000c0de'

    // Child holder: allowed on its own name.
    expect(await sim(bob, 'setResolver', [labelId('bob'), someResolver])).toBe(
      'no revert',
    )
    expect(
      await sim(bob, 'setSubregistry', [labelId('bob'), someResolver]),
    ).toBe('no revert')
    // The parent keeps root roles (its reclaim authority), so the registry is
    // not emancipated: a safe transfer is refused on purpose, and the holder
    // moves the name with an explicit unsafe transfer instead (E2E-036, #1391).
    expect(
      (
        await sim(bob, 'safeTransferFrom', [
          bob.address,
          recipient.address,
          bobState.tokenId,
          1n,
          '0x',
        ])
      ).slice(0, 10),
      'safe transfer refused while the parent can reclaim',
    ).toBe(TRANSFER_UNSAFE_UNTIL_EMANCIPATED)
    expect(
      await sim(bob, 'unsafeTransfer', [
        recipient.address,
        bobState.tokenId,
        '0x',
      ]),
      'the holder can still move its own name',
    ).toBe('no revert')
    expect(
      await sim(recipient, 'unsafeTransfer', [
        recipient.address,
        bobState.tokenId,
        '0x',
      ]),
      'nobody else can move it',
    ).not.toBe('no revert')

    // Child holder: denied on its sibling and on the parent's registry.
    expect(
      await sim(bob, 'setResolver', [labelId('zed'), someResolver]),
    ).not.toBe('no revert')
    expect(await sim(bob, 'unregister', [labelId('zed')])).not.toBe('no revert')
    expect(
      await sim(bob, 'register', [
        'intruder',
        bob.address,
        zeroAddress,
        zeroAddress,
        ROLES_ALL,
        MAX_UINT64,
      ]),
    ).not.toBe('no revert')
    expect(await sim(bob, 'grantRootRoles', [ROLES_ALL, bob.address])).not.toBe(
      'no revert',
    )

    // Parent owner: may register a new child under its registry.
    expect(
      await sim(owner, 'register', [
        'fresh',
        owner.address,
        zeroAddress,
        zeroAddress,
        ROLES_ALL,
        MAX_UINT64,
      ]),
    ).toBe('no revert')
    // An unrelated wallet has no authority at all.
    expect(await sim(recipient, 'unregister', [labelId('bob')])).not.toBe(
      'no revert',
    )
    expect(zedState.latestOwner.toLowerCase()).toBe(owner.address.toLowerCase())

    // Parent reclaim: unregister bob's recreated name, then take the label.
    await send(
      owner,
      registry,
      encodeFunctionData({
        abi: USER_REGISTRY_WRITE_ABI,
        functionName: 'unregister',
        args: [labelId('bob')],
      }),
      'owner unregister(bob)',
    )
    expect(
      (await registryState(registry, 'bob')).status,
      'reclaimed: the label is free again',
    ).toBe(0)
    expect(
      await sim(bob, 'setResolver', [labelId('bob'), someResolver]),
      'the former holder lost control with the name',
    ).not.toBe('no revert')
    await send(
      owner,
      registry,
      encodeFunctionData({
        abi: USER_REGISTRY_WRITE_ABI,
        functionName: 'register',
        args: [
          'bob',
          owner.address,
          zeroAddress,
          V1_PUBLIC_RESOLVER,
          ROLES_ALL,
          MAX_UINT64,
        ],
      }),
      'owner re-register(bob)',
    )
    const reclaimed = await registryState(registry, 'bob')
    expect(reclaimed.status).toBe(2)
    expect(reclaimed.latestOwner.toLowerCase()).toBe(
      owner.address.toLowerCase(),
    )
    expect(
      Object.fromEntries(await roleHolders(registry, reclaimed.resource)),
      'the re-registered name starts a fresh role scope: bob holds nothing',
    ).toEqual({ [owner.address.toLowerCase()]: ROLES_ALL })
  })

  test('a child that changes owner after review blocks the upgrade, writes nothing, and a fresh review recreates it for the new owner', async ({
    page,
    wallet,
    accounts,
  }) => {
    const owner = privateKeyToAccount(accounts.getPrivateKey('user'))
    const bob = privateKeyToAccount(accounts.getPrivateKey('user2'))
    const newHolder = privateKeyToAccount(accounts.getPrivateKey('user4'))
    await asPlainEoas(bob, newHolder)
    const parent = await createMakeV1Name({ userAccount: owner })({
      label: 'w1934-stale',
    })
    const parentLabel = parent.replace(/\.eth$/, '')
    const bobName = await registryChild({
      parent,
      label: 'bob',
      parentOwner: owner,
      holder: bob,
      resolver: V1_PUBLIC_RESOLVER,
    })
    await serveV1Names(page, [
      {
        name: parent,
        ownerAddress: owner.address,
        expiryDate: await v1Expiry(parentLabel),
      },
    ])
    await mockSubnameInventory(page, [
      { name: parent, children: [{ name: bobName }] },
    ])
    await connectWithFlags(page, wallet, { recreation: true })
    await openMigrationFlow(page)
    await selectOnlyRoots(page, [parent])
    const upgrade = page.getByRole('button', { name: /^Upgrade \d+ names?$/ })
    await expect(upgrade, 'the recreation plan is ready').toBeEnabled({
      timeout: 120_000,
    })

    // The source changes after review: bob hands the V1 node to someone else.
    await send(
      bob,
      V1_ENS_REGISTRY,
      encodeFunctionData({
        abi: parseAbi(['function setOwner(bytes32 node, address owner)']),
        functionName: 'setOwner',
        args: [namehash(bobName), newHolder.address],
      }),
      'bob setOwner(newHolder)',
    )

    const outcome = await upgradeAndSettle(page, wallet)
    expect(outcome, 'the upgrade must not succeed on a stale review').not.toBe(
      'success',
    )
    expect(
      (await ethRegistryState(parentLabel)).status,
      'parent untouched',
    ).toBe(1)
    await assertNoUserRegistry(parent)

    // A fresh review picks up the new holder; nothing was half-imported.
    await openMigrationFlow(page)
    await selectOnlyRoots(page, [parent])
    await confirmAndAuthorize(page, wallet)
    const registry = await assertUserRegistryAttached(parent)
    const state = await registryState(registry, 'bob')
    expect(state.status).toBe(2)
    expect(state.latestOwner.toLowerCase()).toBe(
      newHolder.address.toLowerCase(),
    )
  })

  test('the blocked-tree explanation links to an anchor that exists', async ({
    page,
    wallet,
    accounts,
  }) => {
    const owner = privateKeyToAccount(accounts.getPrivateKey('user'))
    const other = privateKeyToAccount(accounts.getPrivateKey('user2'))
    await asPlainEoas(other)
    const parent = await createMakeV1Name({ userAccount: owner })({
      label: 'w1933-link',
    })
    const mid = await registryChild({
      parent,
      label: 'mid',
      parentOwner: owner,
      holder: other,
    })
    const leaf = await registryChild({
      parent: mid,
      label: 'leaf',
      parentOwner: other,
      holder: other,
    })
    // A childless control keeps the page on "ready to upgrade".
    const control = await controlName(owner, 'w1933-linkctl')
    await serveV1Names(page, [
      {
        name: parent,
        ownerAddress: owner.address,
        expiryDate: await v1Expiry(parent.replace(/\.eth$/, '')),
      },
      control.entry,
    ])
    await mockSubnameInventory(page, [
      { name: parent, children: [{ name: mid, children: [{ name: leaf }] }] },
      { name: control.name },
    ])
    await connectWithFlags(page, wallet, { recreation: true })
    await openMigrationFlow(page)
    await expect(
      page
        .getByText('This name has subnames with further subnames below them.', {
          exact: false,
        })
        .first(),
    ).toBeVisible({ timeout: 60_000 })
    const link = page
      .getByRole('link', { name: 'Learn how subnames affect upgrades' })
      .first()
    await expect(link).toHaveAttribute('href', '/dashboard#subname-upgrades')
    await link.click()
    await expect(page).toHaveURL(/\/dashboard#subname-upgrades$/)
    await expect(page.locator('#subname-upgrades')).toBeVisible({
      timeout: 30_000,
    })
  })
})

test.describe('#1494 WEB-1933 on a phone: blocked parents explain themselves', () => {
  test.describe.configure({ timeout: 300_000 })
  test.use({ viewport: { width: 390, height: 844 } })

  test('a 4LD tree and a flag-off parent show their reasons and the docs link, and cannot be selected', async ({
    page,
    wallet,
    accounts,
  }) => {
    const owner = privateKeyToAccount(accounts.getPrivateKey('user'))
    const other = privateKeyToAccount(accounts.getPrivateKey('user2'))
    await asPlainEoas(other)
    const parent = await createMakeV1Name({ userAccount: owner })({
      label: 'w1933-mob',
    })
    const mid = await registryChild({
      parent,
      label: 'mid',
      parentOwner: owner,
      holder: other,
    })
    const leaf = await registryChild({
      parent: mid,
      label: 'leaf',
      parentOwner: other,
      holder: other,
    })
    const control = await controlName(owner, 'w1933-mobctl')
    await serveV1Names(page, [
      {
        name: parent,
        ownerAddress: owner.address,
        expiryDate: await v1Expiry(parent.replace(/\.eth$/, '')),
      },
      control.entry,
    ])
    await mockSubnameInventory(page, [
      { name: parent, children: [{ name: mid, children: [{ name: leaf }] }] },
      { name: control.name },
    ])
    await connectWithFlags(page, wallet, { recreation: true })
    await openMigrationFlow(page)
    await expect(rootRow(page, control.name)).toBeVisible({ timeout: 60_000 })
    const reason = page
      .getByText(
        'This name has subnames with further subnames below them. Upgrading the whole tree is not supported yet.',
      )
      .first()
    await expect(reason)
      .toBeInViewport({ ratio: 0.5, timeout: 30_000 })
      .catch(async () => {
        await reason.scrollIntoViewIfNeeded()
        await expect(reason).toBeInViewport({ ratio: 0.5 })
      })
    const link = page
      .getByRole('link', { name: 'Learn how subnames affect upgrades' })
      .first()
    await link.scrollIntoViewIfNeeded()
    await expect(link).toBeVisible()
    await expectNotSelectable(page, parent)
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
      'no horizontal overflow at phone width',
    ).toBe(true)
    await page.screenshot({
      path: 'test-results/web1933-mobile-blocked.png',
      fullPage: true,
    })
  })
})

// ---------------------------------------------------------------------------
// WEB-1933 remaining block reasons, and a destination conflict (plan A, B)
// ---------------------------------------------------------------------------

const NAME_WRAPPER_WRITE_ABI = parseAbi([
  'function setSubnodeOwner(bytes32 parentNode, string label, address owner, uint32 fuses, uint64 expiry) returns (bytes32)',
  'function getData(uint256 id) view returns (address owner, uint32 fuses, uint64 expiry)',
])
const CAN_EXTEND_EXPIRY = 1 << 18

/** Assert a blocked parent: its reason is shown, it can't be picked, and it is untouched on chain. */
async function expectBlockedParent(page: Page, parent: string, reason: string) {
  await expect(page.getByText(reason).first()).toBeVisible({ timeout: 60_000 })
  await expectNotSelectable(page, parent)
}

async function expectUntouched(parent: string) {
  await assertV2Reserved(parent.replace(/\.eth$/, ''))
  await assertNoUserRegistry(parent)
}

/**
 * A wrapped child of `parent` (an unlocked wrapped 2LD) whose fuses are not
 * zero. Tries the real NameWrapper path first; if the wrapper refuses that
 * shape, forges the fuses in its token storage and says so.
 */
async function wrappedChildWithFuses(params: {
  readonly parent: string
  readonly label: string
  readonly parentOwner: Signer
  readonly holder: Address
}): Promise<{ name: string; forged: boolean }> {
  const name = `${params.label}.${params.parent}`
  const { timestamp } = await publicClient.getBlock()
  try {
    await send(
      params.parentOwner,
      V1_NAME_WRAPPER,
      encodeFunctionData({
        abi: NAME_WRAPPER_WRITE_ABI,
        functionName: 'setSubnodeOwner',
        args: [
          namehash(params.parent),
          params.label,
          params.holder,
          CAN_EXTEND_EXPIRY,
          timestamp + 180n * 24n * 3600n,
        ],
      }),
      `wrapper setSubnodeOwner(${name}, CAN_EXTEND_EXPIRY)`,
    )
    return { name, forged: false }
  } catch {
    // The NameWrapper refuses fuses on a child of an unlocked parent: wrap
    // it plainly, then forge the fuse bits in its `_tokens` slot.
    await send(
      params.parentOwner,
      V1_NAME_WRAPPER,
      encodeFunctionData({
        abi: NAME_WRAPPER_WRITE_ABI,
        functionName: 'setSubnodeOwner',
        args: [
          namehash(params.parent),
          params.label,
          params.holder,
          0,
          timestamp + 180n * 24n * 3600n,
        ],
      }),
      `wrapper setSubnodeOwner(${name})`,
    )
    const id = BigInt(namehash(name))
    for (let slot = 0n; slot < 40n; slot++) {
      const key = keccak256(
        encodeAbiParameters(
          [{ type: 'uint256' }, { type: 'uint256' }],
          [id, slot],
        ),
      )
      const raw = await publicClient.getStorageAt({
        address: V1_NAME_WRAPPER,
        slot: key,
      })
      const value = BigInt(raw ?? '0x0')
      if (
        value !== 0n &&
        (value & ((1n << 160n) - 1n)) === BigInt(params.holder)
      ) {
        await testClient.setStorageAt({
          address: V1_NAME_WRAPPER,
          index: key,
          value: toHex(value | (BigInt(CAN_EXTEND_EXPIRY) << 160n), {
            size: 32,
          }),
        })
        const [, fuses] = await publicClient.readContract({
          address: V1_NAME_WRAPPER,
          abi: NAME_WRAPPER_WRITE_ABI,
          functionName: 'getData',
          args: [id],
        })
        if (fuses !== 0) return { name, forged: true }
      }
    }
    throw new Error(`could not give ${name} non-zero fuses`)
  }
}

test.describe('#1494 WEB-1933 remaining block reasons and conflicts', () => {
  test.describe.configure({ timeout: 420_000 })

  test('A1 a locked parent with dependent subnames is blocked as unsupported', async ({
    page,
    wallet,
    accounts,
  }) => {
    const owner = privateKeyToAccount(accounts.getPrivateKey('user'))
    const other = privateKeyToAccount(accounts.getPrivateKey('user2'))
    await asPlainEoas(other)
    let child = ''
    const parent = await createMakeV1Name({ userAccount: owner })({
      label: 'a1-locked',
      type: 'locked',
      beforeWrap: async (ethName) => {
        child = await registryChild({
          parent: ethName,
          label: 'dep',
          parentOwner: owner,
          holder: other,
        })
      },
    })
    const control = await controlName(owner, 'a1-ctl')
    await serveV1Names(page, [
      {
        name: parent,
        ownerAddress: owner.address,
        type: 'locked',
        expiryDate: await v1Expiry(parent.replace(/\.eth$/, '')),
      },
      control.entry,
    ])
    await mockSubnameInventory(page, [
      { name: parent, children: [{ name: child }] },
      { name: control.name },
    ])
    await connectWithFlags(page, wallet, { recreation: true })
    await openMigrationFlow(page)
    await expect(rootRow(page, control.name)).toBeVisible({ timeout: 60_000 })
    await expectBlockedParent(
      page,
      parent,
      'This parent has subnames whose protections cannot be preserved by this upgrade yet.',
    )
    await selectOnlyRoots(page, [control.name])
    await confirmAndAuthorize(page, wallet)
    await assertV2Registered(control.name.replace(/\.eth$/, ''))
    await assertV2Reserved(parent.replace(/\.eth$/, ''))
  })

  test('A2 a wrapped child with fuses blocks its parent (wrapped-protections)', async ({
    page,
    wallet,
    accounts,
  }) => {
    const owner = privateKeyToAccount(accounts.getPrivateKey('user'))
    const other = privateKeyToAccount(accounts.getPrivateKey('user2'))
    await asPlainEoas(other)
    const parent = await createMakeV1Name({ userAccount: owner })({
      label: 'a2-fuses',
      type: 'wrapped',
    })
    const child = await wrappedChildWithFuses({
      parent,
      label: 'fused',
      parentOwner: owner,
      holder: other.address,
    })
    console.log(
      `[A2] ${child.name}: fuses ${child.forged ? 'FORGED in NameWrapper storage (the wrapper refused the real shape)' : 'set through NameWrapper.setSubnodeOwner'}`,
    )
    const control = await controlName(owner, 'a2-ctl')
    await serveV1Names(page, [
      {
        name: parent,
        ownerAddress: owner.address,
        type: 'wrapped',
        expiryDate: await v1Expiry(parent.replace(/\.eth$/, '')),
      },
      control.entry,
    ])
    await mockSubnameInventory(page, [
      { name: parent, children: [{ name: child.name }] },
      { name: control.name },
    ])
    await connectWithFlags(page, wallet, { recreation: true })
    await openMigrationFlow(page)
    await expect(rootRow(page, control.name)).toBeVisible({ timeout: 60_000 })
    await expectBlockedParent(
      page,
      parent,
      'This name has wrapped subnames whose permissions and protections cannot be preserved yet.',
    )
    await expectUntouched(parent)
  })

  test('A3 more than 200 indexed children blocks the parent as too large', async ({
    page,
    wallet,
    accounts,
  }) => {
    const owner = privateKeyToAccount(accounts.getPrivateKey('user'))
    const parent = await createMakeV1Name({ userAccount: owner })({
      label: 'a3-big',
    })
    const control = await controlName(owner, 'a3-ctl')
    await serveV1Names(page, [
      {
        name: parent,
        ownerAddress: owner.address,
        expiryDate: await v1Expiry(parent.replace(/\.eth$/, '')),
      },
      control.entry,
    ])
    await mockSubnameInventory(page, [
      { name: parent, children: [], subnameCount: 201 },
      { name: control.name },
    ])
    await connectWithFlags(page, wallet, { recreation: true })
    await openMigrationFlow(page)
    await expect(rootRow(page, control.name)).toBeVisible({ timeout: 60_000 })
    await expectBlockedParent(
      page,
      parent,
      'This name has too many subnames to include in one safe upgrade.',
    )
    await expectUntouched(parent)
  })

  test('A4 a child whose label the index cannot name blocks the parent', async ({
    page,
    wallet,
    accounts,
  }) => {
    const owner = privateKeyToAccount(accounts.getPrivateKey('user'))
    const parent = await createMakeV1Name({ userAccount: owner })({
      label: 'a4-label',
    })
    const child = await registryChild({
      parent,
      label: 'hidden',
      parentOwner: owner,
      holder: owner,
    })
    const encoded = `[${labelhash('hidden').slice(2)}].${parent}`
    const control = await controlName(owner, 'a4-ctl')
    await serveV1Names(page, [
      {
        name: parent,
        ownerAddress: owner.address,
        expiryDate: await v1Expiry(parent.replace(/\.eth$/, '')),
      },
      control.entry,
    ])
    await mockSubnameInventory(page, [
      { name: parent, children: [{ name: encoded }] },
      { name: control.name },
    ])
    void child
    await connectWithFlags(page, wallet, { recreation: true })
    await openMigrationFlow(page)
    await expect(rootRow(page, control.name)).toBeVisible({ timeout: 60_000 })
    await expectBlockedParent(
      page,
      parent,
      "A subname's complete name could not be verified. Keep this parent on ENSv1 until it can be recovered.",
    )
    await expectUntouched(parent)
  })

  test('A5 a 150-child family either upgrades whole or not at all', async ({
    page,
    wallet,
    accounts,
  }) => {
    test.setTimeout(900_000)
    const owner = privateKeyToAccount(accounts.getPrivateKey('user'))
    const parent = await createMakeV1Name({ userAccount: owner })({
      label: 'a5-wide',
    })
    const children: string[] = []
    for (let i = 0; i < 150; i++)
      children.push(
        await registryChild({
          parent,
          label: `c${i}`,
          parentOwner: owner,
          holder: owner,
        }),
      )
    await serveV1Names(page, [
      {
        name: parent,
        ownerAddress: owner.address,
        expiryDate: await v1Expiry(parent.replace(/\.eth$/, '')),
      },
    ])
    await mockSubnameInventory(page, [
      { name: parent, children: children.map((name) => ({ name })) },
    ])
    await connectWithFlags(page, wallet, { recreation: true })
    await openMigrationFlow(page)
    await selectOnlyRoots(page, [parent])
    const upgrade = page.getByRole('button', { name: /^Upgrade \d+ names?$/ })
    const prepared = await Promise.race([
      expect(upgrade)
        .toBeEnabled({ timeout: 240_000 })
        .then(() => 'ready' as const),
      page
        .getByText(/Couldn.t prepare your upgrade|too large|too many/i)
        .first()
        .waitFor({ timeout: 240_000 })
        .then(() => 'refused' as const),
    ])
    console.log(`[A5] 150-child family: plan ${prepared}`)
    if (prepared === 'ready') {
      const outcome = await upgradeAndSettle(page, wallet)
      console.log(`[A5] outcome: ${outcome}`)
    }
    // The invariant either way: never a partial family.
    const status = (await ethRegistryState(parent.replace(/\.eth$/, ''))).status
    if (status === 2) {
      const registry = await assertUserRegistryAttached(parent)
      let registered = 0
      for (const name of children)
        if (
          (await registryState(registry, name.split('.')[0] ?? '')).status === 2
        )
          registered++
      expect(registered, 'all children land with their parent').toBe(150)
    } else {
      await expectUntouched(parent)
    }
  })

  test('A6 a child created after review blocks the upgrade; nothing is half-imported', async ({
    page,
    wallet,
    accounts,
  }) => {
    const owner = privateKeyToAccount(accounts.getPrivateKey('user'))
    const parent = await createMakeV1Name({ userAccount: owner })({
      label: 'a6-late',
    })
    const known = await registryChild({
      parent,
      label: 'known',
      parentOwner: owner,
      holder: owner,
    })
    await serveV1Names(page, [
      {
        name: parent,
        ownerAddress: owner.address,
        expiryDate: await v1Expiry(parent.replace(/\.eth$/, '')),
      },
    ])
    await mockSubnameInventory(page, [
      { name: parent, children: [{ name: known }] },
    ])
    await connectWithFlags(page, wallet, { recreation: true })
    await openMigrationFlow(page)
    await selectOnlyRoots(page, [parent])
    await expect(
      page.getByRole('button', { name: /^Upgrade \d+ names?$/ }),
    ).toBeEnabled({ timeout: 120_000 })
    // A child the index never published appears on chain.
    await registryChild({
      parent,
      label: 'late',
      parentOwner: owner,
      holder: owner,
    })
    const outcome = await upgradeAndSettle(page, wallet)
    expect(outcome).not.toBe('success')
    await expectUntouched(parent)
  })

  test('A7 a child whose resolver changes after review blocks the upgrade', async ({
    page,
    wallet,
    accounts,
  }) => {
    const owner = privateKeyToAccount(accounts.getPrivateKey('user'))
    const bob = privateKeyToAccount(accounts.getPrivateKey('user2'))
    await asPlainEoas(bob)
    const parent = await createMakeV1Name({ userAccount: owner })({
      label: 'a7-resolver',
    })
    const bobName = await registryChild({
      parent,
      label: 'bob',
      parentOwner: owner,
      holder: bob,
      resolver: V1_PUBLIC_RESOLVER,
    })
    await serveV1Names(page, [
      {
        name: parent,
        ownerAddress: owner.address,
        expiryDate: await v1Expiry(parent.replace(/\.eth$/, '')),
      },
    ])
    await mockSubnameInventory(page, [
      { name: parent, children: [{ name: bobName }] },
    ])
    await connectWithFlags(page, wallet, { recreation: true })
    await openMigrationFlow(page)
    await selectOnlyRoots(page, [parent])
    await expect(
      page.getByRole('button', { name: /^Upgrade \d+ names?$/ }),
    ).toBeEnabled({ timeout: 120_000 })
    await send(
      bob,
      V1_ENS_REGISTRY,
      encodeFunctionData({
        abi: parseAbi(['function setResolver(bytes32 node, address resolver)']),
        functionName: 'setResolver',
        args: [namehash(bobName), '0x000000000000000000000000000000000000c0de'],
      }),
      'bob setResolver',
    )
    const outcome = await upgradeAndSettle(page, wallet)
    expect(outcome).not.toBe('success')
    await expectUntouched(parent)
  })

  test('B1 an occupied UserRegistry slot fails closed and leaves unrelated names alone', async ({
    page,
    wallet,
    accounts,
  }) => {
    const owner = privateKeyToAccount(accounts.getPrivateKey('user'))
    const parent = await createMakeV1Name({ userAccount: owner })({
      label: 'b1-conflict',
    })
    const child = await registryChild({
      parent,
      label: 'kid',
      parentOwner: owner,
      holder: owner,
    })
    const sibling = await controlName(owner, 'b1-sibling')
    const siblingBefore = await ethRegistryState(
      sibling.name.replace(/\.eth$/, ''),
    )
    const slot = predictUserRegistry(await hcaOf(owner.address), parent)
    const planted = '0x60006000fd' as const // PUSH 0 PUSH 0 REVERT
    await testClient.setCode({ address: slot, bytecode: planted })

    await serveV1Names(page, [
      {
        name: parent,
        ownerAddress: owner.address,
        expiryDate: await v1Expiry(parent.replace(/\.eth$/, '')),
      },
    ])
    await mockSubnameInventory(page, [
      { name: parent, children: [{ name: child }] },
    ])
    await connectWithFlags(page, wallet, { recreation: true })
    await openMigrationFlow(page)
    await selectOnlyRoots(page, [parent])
    const upgrade = page.getByRole('button', { name: /^Upgrade \d+ names?$/ })
    const refusedEarly = await page
      .getByText(/Couldn.t prepare your upgrade|subname registry/i)
      .first()
      .waitFor({ timeout: 120_000 })
      .then(() => true)
      .catch(() => false)
    if (!refusedEarly && (await upgrade.isEnabled())) {
      const outcome = await upgradeAndSettle(page, wallet)
      expect(outcome).not.toBe('success')
    }
    expect(await publicClient.getCode({ address: slot })).toBe(planted)
    await assertV2Reserved(parent.replace(/\.eth$/, ''))
    const siblingAfter = await ethRegistryState(
      sibling.name.replace(/\.eth$/, ''),
    )
    expect(siblingAfter, 'an unrelated name is untouched').toEqual(
      siblingBefore,
    )
  })
})

// ---------------------------------------------------------------------------
// Failure, retry, abandonment, durable recovery and cleanup (plan C)
// ---------------------------------------------------------------------------

/** Wallet transactions `account` sent in blocks after `from`. */
async function txsFrom(account: Address, from: bigint): Promise<number> {
  const head = await publicClient.getBlockNumber({ cacheTime: 0 })
  let count = 0
  for (let n = from; n <= head; n++) {
    const block = await publicClient.getBlock({
      blockNumber: n,
      includeTransactions: true,
    })
    count += block.transactions.filter(
      (tx) =>
        typeof tx !== 'string' &&
        tx.from.toLowerCase() === account.toLowerCase(),
    ).length
  }
  return count
}

/** Authorize exactly one pending eth_sendTransaction, waiting for it to appear. */
async function authorizeOne(
  page: Page,
  wallet: import('@ensdomains/headless-web3-provider').Web3ProviderBackend,
) {
  const { Web3RequestKind } = await import('@ensdomains/headless-web3-provider')
  const deadline = Date.now() + 120_000
  while (wallet.getPendingRequestCount(Web3RequestKind.SendTransaction) === 0) {
    if (Date.now() > deadline) throw new Error('no wallet prompt arrived')
    await page.waitForTimeout(250)
  }
  await wallet.authorize(Web3RequestKind.SendTransaction)
}

/** Wallet transactions `account` sent to `to` in blocks after `from`. */
async function txsTo(
  account: Address,
  to: Address,
  from: bigint,
): Promise<number> {
  const head = await publicClient.getBlockNumber({ cacheTime: 0 })
  let count = 0
  for (let n = from; n <= head; n++) {
    const block = await publicClient.getBlock({
      blockNumber: n,
      includeTransactions: true,
    })
    count += block.transactions.filter(
      (tx) =>
        typeof tx !== 'string' &&
        tx.from.toLowerCase() === account.toLowerCase() &&
        tx.to?.toLowerCase() === to.toLowerCase(),
    ).length
  }
  return count
}

const isApprovedForAll = (owner: Address, operator: Address) =>
  publicClient.readContract({
    address: V2_ETH_REGISTRY,
    abi: parseAbi([
      'function isApprovedForAll(address owner, address operator) view returns (bool)',
    ]),
    functionName: 'isApprovedForAll',
    args: [owner, operator],
  })

async function mempoolSize(): Promise<number> {
  const status = (await publicClient.request({
    method: 'txpool_status',
  } as never)) as { pending: string }
  return Number(status.pending)
}

/** What the upgrade page says after a reload, for the run log. */
async function upgradePageState(page: Page): Promise<string> {
  const heading = await page
    .getByRole('heading', { level: 1 })
    .first()
    .innerText()
    .catch(() => '')
  const footer = await page
    .getByRole('button', { name: /^(Upgrade \d+ names?|Finish upgrade)$/ })
    .first()
    .innerText()
    .catch(() => '')
  return `${heading} | ${footer}`
}

async function simpleTree(
  owner: Signer,
  tag: string,
  holder: Signer = owner,
): Promise<{ parent: string; child: string }> {
  const parent = await createMakeV1Name({ userAccount: owner })({ label: tag })
  const child = await registryChild({
    parent,
    label: 'kid',
    parentOwner: owner,
    holder,
    resolver: V1_PUBLIC_RESOLVER,
  })
  return { parent, child }
}

async function serveTree(
  page: Page,
  owner: Signer,
  parent: string,
  child: string,
) {
  await serveV1Names(page, [
    {
      name: parent,
      ownerAddress: owner.address,
      expiryDate: await v1Expiry(parent.replace(/\.eth$/, '')),
    },
  ])
  await mockSubnameInventory(page, [
    { name: parent, children: [{ name: child }] },
  ])
}

test.describe('#1494 failure, retry, abandonment and recovery', () => {
  test.describe.configure({ timeout: 480_000 })
  test.afterEach(async () => {
    await testClient.setAutomine(true).catch(() => {})
  })

  test('C1 a page abandoned while the migration batch is pending reconciles its receipt and never sends it twice', async ({
    page,
    wallet,
    accounts,
  }) => {
    const owner = privateKeyToAccount(accounts.getPrivateKey('user'))
    const { parent, child } = await simpleTree(owner, 'c1-abandon')
    await serveTree(page, owner, parent, child)
    await connectWithFlags(page, wallet, { recreation: true })
    await openMigrationFlow(page)
    await selectOnlyRoots(page, [parent])
    const plan = await readPlan(page)
    console.log(`[C1] plan: ${plan.count} — ${plan.steps.join(' → ')}`)
    const upgrade = page.getByRole('button', { name: /^Upgrade \d+ names?$/ })
    await expect(upgrade).toBeEnabled({ timeout: 120_000 })

    // Setup prompts land normally; only the final migration batch is held.
    await upgrade.click()
    for (let i = 0; i < plan.count - 1; i++) await authorizeOne(page, wallet)
    await page.waitForTimeout(3_000)
    const hca = await hcaOf(owner.address)
    const from = (await publicClient.getBlockNumber({ cacheTime: 0 })) + 1n
    await testClient.setAutomine(false)
    await authorizeOne(page, wallet)
    await expect.poll(mempoolSize, { timeout: 30_000 }).toBeGreaterThan(0)

    // Abandon: the page goes away with the batch still unmined.
    await page.reload()
    await testClient.mine({ blocks: 1 })
    await testClient.setAutomine(true)
    await openMigrationFlow(page).catch(() => {})
    await page.waitForTimeout(15_000)
    console.log(`[C1] on return: ${await upgradePageState(page)}`)
    const finish = page.getByRole('button', { name: 'Finish upgrade' })
    if (await finish.isVisible().catch(() => false)) {
      let done = false
      const authorizing = authorizeTransactionsWhile(page, wallet, () => done)
      await finish.click()
      await page.waitForTimeout(20_000)
      done = true
      await Promise.race([authorizing, page.waitForTimeout(5_000)])
    }

    await assertV2Registered(parent.replace(/\.eth$/, ''))
    const registry = await assertUserRegistryAttached(parent)
    expect((await registryState(registry, 'kid')).status).toBe(2)
    expect(
      await txsTo(owner.address, hca, from),
      'exactly one migration batch reached the HCA',
    ).toBe(1)
    await expect(rootRow(page, parent)).toHaveCount(0)
  })

  test('C2 a batch that reverts on chain writes nothing, and a retry completes the whole tree', async ({
    page,
    wallet,
    accounts,
  }) => {
    const owner = privateKeyToAccount(accounts.getPrivateKey('user'))
    const { parent, child } = await simpleTree(owner, 'c2-revert')
    await serveTree(page, owner, parent, child)
    await connectWithFlags(page, wallet, { recreation: true })
    await openMigrationFlow(page)
    await selectOnlyRoots(page, [parent])
    const upgrade = page.getByRole('button', { name: /^Upgrade \d+ names?$/ })
    await expect(upgrade).toBeEnabled({ timeout: 120_000 })

    // Hold the batch in the mempool, then occupy the UserRegistry slot it
    // deploys to, so the whole atomic batch reverts when mined.
    const slot = predictUserRegistry(await hcaOf(owner.address), parent)
    await testClient.setAutomine(false)
    await upgrade.click()
    await authorizeOne(page, wallet)
    await expect.poll(mempoolSize, { timeout: 30_000 }).toBeGreaterThan(0)
    await testClient.setCode({ address: slot, bytecode: '0x60006000fd' })
    await testClient.mine({ blocks: 1 })
    await testClient.setAutomine(true)
    await page.waitForTimeout(10_000)
    console.log(
      `[C2] after the revert: ${await page.locator('main').innerText()}`,
    )

    await expectUntouched(parent)
    expect(
      (
        await publicClient.readContract({
          address: V1_ENS_REGISTRY,
          abi: parseAbi([
            'function owner(bytes32 node) view returns (address)',
          ]),
          functionName: 'owner',
          args: [namehash(child)],
        })
      ).toLowerCase(),
      'the V1 child is untouched',
    ).toBe(owner.address.toLowerCase())

    // Clear the obstruction and retry from a fresh review.
    await testClient.setCode({ address: slot, bytecode: '0x' })
    await openMigrationFlow(page)
    await selectOnlyRoots(page, [parent])
    await confirmAndAuthorize(page, wallet)
    const registry = await assertUserRegistryAttached(parent)
    expect(registry.toLowerCase()).toBe(slot.toLowerCase())
    expect((await registryState(registry, 'kid')).status).toBe(2)
  })

  test('C3a a plain kept-manager run interrupted before cleanup: no cleanup on return; the next upgrade revokes it', async ({
    page,
    wallet,
    accounts,
  }) => {
    const owner = privateKeyToAccount(accounts.getPrivateKey('user'))
    const manager = privateKeyToAccount(accounts.getPrivateKey('user2'))
    await asPlainEoas(manager)
    const name = await createMakeV1Name({ userAccount: owner })({
      label: 'c3a-cleanup',
      records: { texts: [{ key: 'description', value: 'c3a' }] },
    })
    const label = name.replace(/\.eth$/, '')
    await splitController(name, owner, manager.address)
    const spare = await controlName(owner, 'c3a-spare')
    await serveV1Names(page, {
      ownerAddress: owner.address,
      roots: [
        {
          kind: 'registration',
          label,
          ownerAddress: manager.address,
          registrantAddress: owner.address,
          expiryDate: await v1Expiry(label),
        },
        {
          kind: 'registration',
          label: spare.name.replace(/\.eth$/, ''),
          expiryDate: spare.entry.expiryDate,
        },
      ],
    })
    await mockSubnameInventory(page, [{ name }, { name: spare.name }])
    await connectWithFlags(page, wallet, { recreation: false })
    await openMigrationFlow(page)
    await selectOnlyRoots(page, [name])
    const optIn = page.getByRole('checkbox', { name: /^Keep .* as a manager/ })
    await optIn.locator('xpath=..').click()
    const plan = await readPlan(page)
    expect(plan.steps.at(-1)).toMatch(/Remove temporary access/)
    const hca = await hcaOf(owner.address)
    await page.getByRole('button', { name: /^Upgrade \d+ names?$/ }).click()
    for (let i = 0; i < plan.count - 1; i++) await authorizeOne(page, wallet)
    await expect
      .poll(() => isApprovedForAll(owner.address, hca), { timeout: 120_000 })
      .toBe(true)
    await assertV2Registered(label)
    await page.reload()

    await openMigrationFlow(page)
    await page.waitForTimeout(10_000)
    console.log(`[C3a] on return: ${await upgradePageState(page)}`)
    const offersCleanup = await page
      .getByRole('button', { name: 'Finish upgrade' })
      .isVisible()
      .catch(() => false)
    console.log(
      `[C3a] cleanup offered on return: ${offersCleanup}; HCA still approved: ${await isApprovedForAll(owner.address, hca)}`,
    )

    // The next upgrade is the recovery path: it revokes the stale approval.
    await selectOnlyRoots(page, [spare.name])
    await confirmAndAuthorize(page, wallet)
    expect(
      await isApprovedForAll(owner.address, hca),
      'the stale temporary approval is gone after the next upgrade',
    ).toBe(false)
  })

  for (const withdrawn of [true, false])
    test(`C3b ${withdrawn ? 'with rollout withdrawn' : 'with rollout still on (control)'}, an interrupted recreation run with a kept manager can only finish its cleanup`, async ({
      page,
      wallet,
      accounts,
    }) => {
      // Finding (2026-10-25): after the final batch the journal keeps the
      // submitted batch but not the recovery snapshot, so a reload at the
      // cleanup prompt offers no "Finish upgrade" and the HCA keeps its
      // ETHRegistry operator approval until the next upgrade, with the flag
      // on or off. Remove `test.fail` once cleanup-only recovery is offered.
      test.fail(
        true,
        'cleanup-only recovery is not offered after an interrupted recreation run',
      )
      const owner = privateKeyToAccount(accounts.getPrivateKey('user'))
      const manager = privateKeyToAccount(accounts.getPrivateKey('user2'))
      await asPlainEoas(manager)
      const parent = await createMakeV1Name({ userAccount: owner })({
        label: 'c3b-cleanup',
      })
      const label = parent.replace(/\.eth$/, '')
      await splitController(parent, owner, manager.address)
      const child = await registryChild({
        parent,
        label: 'kid',
        parentOwner: manager,
        holder: manager,
        resolver: V1_PUBLIC_RESOLVER,
      })
      await serveV1Names(page, {
        ownerAddress: owner.address,
        roots: [
          {
            kind: 'registration',
            label,
            ownerAddress: manager.address,
            registrantAddress: owner.address,
            expiryDate: await v1Expiry(label),
          },
        ],
      })
      await mockSubnameInventory(page, [
        { name: parent, children: [{ name: child }] },
      ])
      await connectWithFlags(page, wallet, { recreation: true })
      await openMigrationFlow(page)
      await selectOnlyRoots(page, [parent])
      const optIn = page.getByRole('checkbox', {
        name: /^Keep .* as a manager/,
      })
      await optIn.locator('xpath=..').click()
      await expect(optIn).toBeChecked()
      const plan = await readPlan(page)
      console.log(`[C3b] plan: ${plan.count} — ${plan.steps.join(' → ')}`)
      expect(plan.steps.at(-1)).toMatch(/Remove temporary access/)
      const hca = await hcaOf(owner.address)
      await page.getByRole('button', { name: /^Upgrade \d+ names?$/ }).click()
      for (let i = 0; i < plan.count - 1; i++) await authorizeOne(page, wallet)
      await expect
        .poll(() => isApprovedForAll(owner.address, hca), { timeout: 120_000 })
        .toBe(true)
      await assertV2Registered(label)
      const registry = await assertUserRegistryAttached(parent)
      expect((await registryState(registry, 'kid')).status).toBe(2)
      await page.reload()

      // Rollout is withdrawn before the user comes back (unless this is the control).
      if (withdrawn)
        await page.evaluate(() => {
          ;(
            window as Window & {
              posthog?: {
                featureFlags: {
                  overrideFeatureFlags(o: {
                    flags: Record<string, boolean>
                  }): void
                }
              }
            }
          ).posthog?.featureFlags.overrideFeatureFlags({
            flags: {
              migration: true,
              'profile-view-new': true,
              'migration-subname-recreation': false,
            },
          })
        })
      await openMigrationFlow(page)
      await page.waitForTimeout(10_000)
      console.log(
        `[C3b withdrawn=${withdrawn}] on return: ${await upgradePageState(page)}`,
      )
      const finish = page.getByRole('button', { name: 'Finish upgrade' })
      await expect(finish, 'only cleanup is offered').toBeVisible({
        timeout: 60_000,
      })
      const from = (await publicClient.getBlockNumber({ cacheTime: 0 })) + 1n
      let done = false
      const authorizing = authorizeTransactionsWhile(page, wallet, () => done)
      await finish.click()
      await expect
        .poll(() => isApprovedForAll(owner.address, hca), { timeout: 120_000 })
        .toBe(false)
      done = true
      await Promise.race([authorizing, page.waitForTimeout(5_000)])
      expect(
        await txsFrom(owner.address, from),
        'cleanup only: one revocation, no new migration',
      ).toBe(1)
      expect(
        (await registryState(registry, 'kid')).status,
        'the recreated child is still there exactly once',
      ).toBe(2)
    })

  test('C5 a completed recreation is not offered again and sends nothing more', async ({
    page,
    wallet,
    accounts,
  }) => {
    const owner = privateKeyToAccount(accounts.getPrivateKey('user'))
    const { parent, child } = await simpleTree(owner, 'c5-once')
    await recreateTree({ page, wallet, owner, parent, children: [child] })
    const from = (await publicClient.getBlockNumber({ cacheTime: 0 })) + 1n
    await openMigrationFlow(page).catch(() => {})
    await page.waitForTimeout(10_000)
    console.log(`[C5] reopened: ${await upgradePageState(page)}`)
    await expect(rootRow(page, parent)).toHaveCount(0)
    expect(await txsFrom(owner.address, from)).toBe(0)
  })
})
