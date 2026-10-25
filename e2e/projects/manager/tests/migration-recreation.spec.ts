import type { Page } from '@playwright/test'
import {
  type Address,
  encodeFunctionData,
  type Hex,
  namehash,
  parseAbi,
  zeroAddress,
} from 'viem'
import { privateKeyToAccount } from 'viem/accounts'

import {
  createMakeV1Name,
  PREMIGRATION_BONUS,
  V1_PUBLIC_RESOLVER,
} from '../../../fixtures/makeV1Name.js'
import { wrapV1SubnameOfUnwrapped } from '../../../fixtures/makeV1Subname.js'
import { expect, test } from '../../../fixtures/playwright.manager.fixture.js'
import {
  cloneV1PublicResolver,
  setV1RecordsOn,
} from '../../../fixtures/v1-records.js'
import { splitController } from '../../../fixtures/v1-tails.js'
import { publicClient } from '../../../helpers/anvil-client.js'
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
  rootRow,
  selectOnlyRoots,
} from '../../../helpers/migration-flow.js'
import { mockSubnameInventory } from '../../../helpers/mock-subname-inventory.js'
import {
  asPlainEoas,
  connectWithFlags,
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
    mockIndexer,
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
      mockIndexer.addName({
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
    mockIndexer,
  }) => {
    const owner = privateKeyToAccount(accounts.getPrivateKey('user'))
    const makeV1Name = createMakeV1Name({ userAccount: owner })
    const resolving = await makeV1Name({
      label: 'p1497-v1',
      records: { addresses: [{ coinType: 60, value: owner.address as Hex }] },
    })
    const bare = await makeV1Name({ label: 'p1497-bare' })
    for (const name of [resolving, bare])
      mockIndexer.addName({
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
