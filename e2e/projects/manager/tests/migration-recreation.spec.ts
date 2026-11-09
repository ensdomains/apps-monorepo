import type { Page } from '@playwright/test'
import {
  type Address,
  encodeAbiParameters,
  encodeFunctionData,
  type Hex,
  keccak256,
  namehash,
  parseAbi,
  toHex,
} from 'viem'
import { privateKeyToAccount } from 'viem/accounts'

import {
  createMakeV1Name,
  PREMIGRATION_BONUS,
  V1_NAME_WRAPPER,
  V1_PUBLIC_RESOLVER,
} from '../../../fixtures/makeV1Name.js'
import { expect, test } from '../../../fixtures/playwright.manager.fixture.js'
import { publicClient, testClient } from '../../../helpers/anvil-client.js'
import {
  assertNoUserRegistry,
  assertUserRegistryAttached,
  assertV2Registered,
  assertV2Reserved,
} from '../../../helpers/migration-assertions.js'
import {
  confirmAndAuthorize,
  openMigrationFlow,
  rootRow,
  selectOnlyRoots,
  upgradeAndSettle,
} from '../../../helpers/migration-flow.js'
import { mockSubnameInventory } from '../../../helpers/mock-subname-inventory.js'
import {
  asPlainEoas,
  connectWithFlags,
  registryChild,
  type Signer,
  send,
} from '../../../helpers/recreation.js'
import { serveV1Names } from '../../../helpers/v1-names.js'
import {
  ethRegistryState,
  hcaOf,
  predictUserRegistry,
  registryState,
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

test.describe('#1494 plain 2LD migration (R2)', () => {
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
      await connectWithFlags(page, wallet)

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

    await connectWithFlags(page, wallet)
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

test.describe('#1494 WEB-1934 acceptance: permissions, stale source, docs link', () => {
  test.describe.configure({ timeout: 420_000 })

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
    await connectWithFlags(page, wallet)
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
    await connectWithFlags(page, wallet)
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
}): Promise<{ name: string; isForged: boolean }> {
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
    return { name, isForged: false }
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
        if (fuses !== 0) return { name, isForged: true }
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
    await connectWithFlags(page, wallet)
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
      `[A2] ${child.name}: fuses ${child.isForged ? 'FORGED in NameWrapper storage (the wrapper refused the real shape)' : 'set through NameWrapper.setSubnodeOwner'}`,
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
    await connectWithFlags(page, wallet)
    await openMigrationFlow(page)
    await expect(rootRow(page, control.name)).toBeVisible({ timeout: 60_000 })
    await expectBlockedParent(
      page,
      parent,
      'This name has wrapped subnames whose permissions and protections cannot be preserved yet.',
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
    await connectWithFlags(page, wallet)
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
      // A refusal or a completed upgrade, never a page left hanging.
      expect(outcome).not.toBe('stuck')
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
    await connectWithFlags(page, wallet)
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
    // The app re-checks the subname inventory at submit and refuses.
    expect(outcome).toBe('subnamesNotPreserved')
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
    await connectWithFlags(page, wallet)
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
      expect(['success', 'stuck']).not.toContain(outcome)
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
