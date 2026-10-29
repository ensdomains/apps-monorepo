/**
 * ENS V1 → V2 migration of unwrapped and emancipated .eth 2LDs (§G.GW, GR, GA,
 * GU), and the registration block on a reserved name (A11).
 *
 * Both shapes go through `UnlockedMigrationController`:
 *
 *   unwrapped    the BaseRegistrar ERC-721 is sent to the controller, which
 *                reclaims it, hands the legacy registry slot to the Graveyard
 *                with the resolver cleared, and parks the token there too
 *   emancipated  the NameWrapper ERC-1155 is sent instead; the controller clears
 *                the resolver and `unwrapETH2LD(label, GRAVEYARD, GRAVEYARD)`s it
 *
 * Either way the name is then registered in the V2 .eth registry out of its
 * RESERVED state with `REGISTRATION_ROLE_BITMAP` — and, like every name
 * registered from RESERVED, `ROLE_WAS_RESERVED`. The oracles read all of that
 * off the chain; the success screen is not evidence of any of it.
 *
 * This file replaces the original `migration.spec.ts`, which no config ran and
 * which mostly asserted that the flow reached its success screen.
 */
import { ensL1Contracts, supportedL1Chains } from '@ensdomains/ensjs/chain'
import {
  getAddressRecord,
  getName,
  getTextRecord,
} from '@ensdomains/ensjs/public'
import { registryRoles } from '@ensdomains/ensjs/utils/v2'
import type { Page } from '@playwright/test'
import {
  type Address,
  namehash,
  parseAbi,
  parseAbiItem,
  zeroAddress,
} from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { createMakeV1Name } from '../../../fixtures/makeV1Name.js'
import { expect, test } from '../../../fixtures/playwright.manager.fixture.js'
import { setV1RecordsOn, type V1Records } from '../../../fixtures/v1-records.js'
import { publicClient } from '../../../helpers/anvil-client.js'
import { isRealBigname } from '../../../helpers/bigname-sync.js'
import {
  assertLockedTokenRoute,
  assertUnlockedTokenRoute,
  assertV2Reserved,
  readV2Status,
  readV2TokenRoles,
} from '../../../helpers/migration-assertions.js'
import {
  confirmAndAuthorize,
  openMigrationFlow,
  readPlan,
  rootRow,
  selectOnlyRoots,
  upgradeCountingPrompts,
} from '../../../helpers/migration-flow.js'
import {
  goToEditProfile,
  saveProfileChanges,
  waitForProfileUpdated,
} from '../../../helpers/profile-helpers.js'
import { expectRecordsResolve } from '../../../helpers/resolve-records.js'
import type { MockV1Records } from '../../../helpers/v1-name-tree.js'
import { serveV1Names } from '../../../helpers/v1-names.js'

const MANAGER_APP_URL = process.env.MANAGER_APP_URL ?? 'http://localhost:3000'

const sepolia = ensL1Contracts[supportedL1Chains.sepolia]
const V2_ETH_REGISTRY = sepolia.ensRegistry.address as Address
const V1_NAME_WRAPPER = sepolia.ensNameWrapper.address as Address

const {
  ROLE_CAN_TRANSFER_ADMIN,
  ROLE_SET_RESOLVER,
  ROLE_SET_RESOLVER_ADMIN,
  ROLE_SET_SUBREGISTRY,
  ROLE_SET_SUBREGISTRY_ADMIN,
  ROLE_WAS_RESERVED,
} = registryRoles

/** `ETHRegistrar.sol` REGISTRATION_ROLE_BITMAP, plus the RESERVED tag. */
const MIGRATED_OWNER_ROLES =
  ROLE_SET_SUBREGISTRY |
  ROLE_SET_SUBREGISTRY_ADMIN |
  ROLE_SET_RESOLVER |
  ROLE_SET_RESOLVER_ADMIN |
  ROLE_CAN_TRANSFER_ADMIN |
  ROLE_WAS_RESERVED

const V2_REGISTRY_ABI = parseAbi([
  'function getResolver(string label) view returns (address)',
])
const TRANSFER_SINGLE = parseAbiItem(
  'event TransferSingle(address indexed operator, address indexed from, address indexed to, uint256 id, uint256 value)',
)
const TRANSFER_BATCH = parseAbiItem(
  'event TransferBatch(address indexed operator, address indexed from, address indexed to, uint256[] ids, uint256[] values)',
)

const hex = (bitmap: bigint) => `0x${bitmap.toString(16)}`
const labelOf = (name: string) => name.replace(/\.eth$/, '')

/** The block after the current head, uncached — the head holds our setup. */
const nextBlock = async () =>
  (await publicClient.getBlockNumber({ cacheTime: 0 })) + 1n

async function migrate(
  page: Page,
  wallet: Parameters<typeof confirmAndAuthorize>[1],
  names: readonly string[],
) {
  await openMigrationFlow(page)
  for (const name of names)
    await expect(rootRow(page, name)).toBeVisible({ timeout: 30_000 })
  await selectOnlyRoots(page, names)
  await confirmAndAuthorize(page, wallet)
}

async function expectOwnerRoles(label: string, owner: Address) {
  const { owner: v2Owner, tokenRoles } = await readV2TokenRoles(label)
  expect(v2Owner.toLowerCase(), `V2 owner of ${label}.eth`).toBe(
    owner.toLowerCase(),
  )
  expect(hex(tokenRoles), `token roles of the owner on ${label}.eth`).toBe(
    hex(MIGRATED_OWNER_ROLES),
  )
}

/** The V2 resolver a migrated name points at, which must exist. */
async function v2Resolver(label: string): Promise<Address> {
  const resolver = await publicClient.readContract({
    address: V2_ETH_REGISTRY,
    abi: V2_REGISTRY_ABI,
    functionName: 'getResolver',
    args: [label],
  })
  expect(resolver, `${label}.eth has no V2 resolver`).not.toBe(zeroAddress)
  return resolver
}

/**
 * A text record as a client resolves it — through the UniversalResolver, which
 * routes to the name's V2 resolver. The owner's PermissionedResolver reverts on
 * a direct `text(node, key)`, so this is also the only read that works.
 */
const readText = async (name: string, key: string) =>
  (await getTextRecord(publicClient as never, { name, key })) ?? null

test.describe('ENS V1 → V2 migration — unwrapped and emancipated 2LDs', () => {
  test.describe.configure({ timeout: 300_000 })

  test('an unwrapped 2LD lands in V2 with exactly the registration roles, its V1 token and registry slot in the Graveyard', {
    tag: ['@smoke', '@scenario:GW1'],
  }, async ({ migrationConnectedPage: page, wallet, accounts }) => {
    const owner = privateKeyToAccount(accounts.getPrivateKey('user'))
    const makeV1Name = createMakeV1Name({ userAccount: owner })
    const name = await makeV1Name({ label: 'gw1-unwrapped' })
    const label = labelOf(name)
    await assertV2Reserved(label)

    await serveV1Names(page, {
      ownerAddress: owner.address,
      roots: [{ kind: 'registration', label }],
    })
    await migrate(page, wallet, [name])

    await assertUnlockedTokenRoute(label, namehash(name), { wrapped: false })
    await expectOwnerRoles(label, owner.address)
  })

  test('an emancipated 2LD is unwrapped into the Graveyard and lands in V2 with exactly the registration roles', {
    tag: ['@smoke', '@scenario:GW2'],
  }, async ({ migrationConnectedPage: page, wallet, accounts }) => {
    const owner = privateKeyToAccount(accounts.getPrivateKey('user'))
    const makeV1Name = createMakeV1Name({ userAccount: owner })
    // `wrapETH2LD` always burns PARENT_CANNOT_CONTROL: a wrapped .eth 2LD with
    // no owner fuses is emancipated, the only unlocked wrapped shape there is.
    const name = await makeV1Name({ label: 'gw2-emancipated', type: 'wrapped' })
    const label = labelOf(name)

    await serveV1Names(page, {
      ownerAddress: owner.address,
      roots: [{ kind: 'registration', label, type: 'wrapped' }],
    })
    await migrate(page, wallet, [name])

    await assertUnlockedTokenRoute(label, namehash(name), { wrapped: true })
    await expectOwnerRoles(label, owner.address)
  })

  test('two wrapped names move to the controller in one batched transfer', {
    tag: ['@smoke', '@scenario:GA4'],
  }, async ({ migrationConnectedPage: page, wallet, accounts }) => {
    const owner = privateKeyToAccount(accounts.getPrivateKey('user'))
    const makeV1Name = createMakeV1Name({ userAccount: owner })
    const a = await makeV1Name({ label: 'ga4-a', type: 'wrapped' })
    const b = await makeV1Name({ label: 'ga4-b', type: 'wrapped' })

    await serveV1Names(page, {
      ownerAddress: owner.address,
      roots: [a, b].map((name) => ({
        kind: 'registration' as const,
        label: labelOf(name),
        type: 'wrapped' as const,
      })),
    })
    const fromBlock = await nextBlock()
    await migrate(page, wallet, [a, b])

    for (const name of [a, b])
      await assertUnlockedTokenRoute(labelOf(name), namehash(name), {
        wrapped: true,
      })

    // ERC-1155 says how the tokens moved: one TransferBatch carrying both ids
    // out of the owner, and no TransferSingle for either.
    const ids = [a, b].map((name) => BigInt(namehash(name)))
    const [batches, singles] = await Promise.all([
      publicClient.getLogs({
        address: V1_NAME_WRAPPER,
        event: TRANSFER_BATCH,
        args: { from: owner.address },
        fromBlock,
      }),
      publicClient.getLogs({
        address: V1_NAME_WRAPPER,
        event: TRANSFER_SINGLE,
        args: { from: owner.address },
        fromBlock,
      }),
    ])
    expect(
      singles.filter((l) => ids.includes(l.args.id as bigint)),
      'neither name may move in a single transfer',
    ).toHaveLength(0)
    const carrying = batches.filter((l) =>
      ids.every((id) => (l.args.ids ?? []).includes(id)),
    )
    expect(carrying, 'one TransferBatch must carry both names').toHaveLength(1)
  })

  test('text records and the ETH address are replayed onto the new V2 resolver', {
    tag: ['@smoke', '@scenario:GR1'],
  }, async ({ migrationConnectedPage: page, wallet, accounts }) => {
    const owner = privateKeyToAccount(accounts.getPrivateKey('user'))
    const makeV1Name = createMakeV1Name({ userAccount: owner })
    const ethAddress = accounts.getAddress('user2')
    const records = {
      texts: [
        { key: 'description', value: 'Migrated from V1 with records' },
        { key: 'url', value: 'https://example.com/v1-migrated' },
      ],
      addresses: [{ coinType: 60, value: ethAddress as `0x${string}` }],
    }
    const name = await makeV1Name({ label: 'gr1-records', records })
    const label = labelOf(name)

    await serveV1Names(page, {
      ownerAddress: owner.address,
      roots: [
        {
          kind: 'registration',
          label,
          records: records as MockV1Records,
        },
      ],
    })
    await migrate(page, wallet, [name])

    await v2Resolver(label)
    for (const { key, value } of records.texts)
      expect(await readText(name, key), `text(${key})`).toBe(value)
    const addr = await getAddressRecord(publicClient as never, {
      name,
      coin: 60,
    })
    expect(addr?.value?.toLowerCase(), 'addr(60)').toBe(
      ethAddress.toLowerCase(),
    )
  })

  test('a profile edited right after migration is written to the new V2 resolver', {
    tag: ['@scenario:GU4'],
  }, async ({ migrationConnectedPage: page, wallet, accounts }) => {
    const owner = privateKeyToAccount(accounts.getPrivateKey('user'))
    const makeV1Name = createMakeV1Name({ userAccount: owner })
    const name = await makeV1Name({ label: 'gu4-edit' })
    const label = labelOf(name)

    await serveV1Names(page, {
      ownerAddress: owner.address,
      roots: [{ kind: 'registration', label }],
    })
    await migrate(page, wallet, [name])

    // Profile editing is a dialog on the profile page (#898 removed the old
    // /edit route). Description and the website field are on its General tab.
    const description = 'Post-migration profile edit'
    const website = 'https://post-migration.example.com'
    await goToEditProfile(page, name)
    await page.getByPlaceholder('Description').fill(description)
    await page.getByPlaceholder('https://yourwebsite.com').fill(website)
    await saveProfileChanges(page, wallet)
    await waitForProfileUpdated(page)

    // The toast is not the oracle; the resolver the name now points at is.
    await v2Resolver(label)
    await expect
      .poll(() => readText(name, 'description'), { timeout: 30_000 })
      .toBe(description)
    expect(await readText(name, 'url')).toBe(website)
  })

  test('a reserved V1 name cannot be registered, and the search says it is taken', {
    tag: ['@scenario:A11'],
  }, async ({ page, accounts }) => {
    const owner = privateKeyToAccount(accounts.getPrivateKey('user'))
    const makeV1Name = createMakeV1Name({ userAccount: owner })
    const name = await makeV1Name({ label: 'a11-reserved' })
    const label = labelOf(name)

    // Chain first: RESERVED in V2, so the registrar refuses it.
    await assertV2Reserved(label)
    const available = await publicClient.readContract({
      address: sepolia.ensEthRegistrar.address as Address,
      abi: parseAbi(['function isAvailable(string label) view returns (bool)']),
      functionName: 'isAvailable',
      args: [label],
    })
    expect(available, 'the registrar must not offer a reserved name').toBe(
      false,
    )

    await serveV1Names(page, {
      ownerAddress: owner.address,
      roots: [{ kind: 'registration', label }],
    })
    // `/register/$name` checks V2 availability in its loader and sends a name
    // that is not available to its profile instead of the registration flow.
    await page.goto(`${MANAGER_APP_URL}/register/${name}`)
    await expect(page).toHaveURL(new RegExp(`/${name.replace('.', '\\.')}$`), {
      timeout: 30_000,
    })
    await expect(
      page.getByRole('button', { name: /^Register$/i }),
      'a reserved name must not be offered for registration',
    ).toHaveCount(0)
    // Instead the visitor sees the name as taken, by its V1 owner — shown by
    // primary name when it has one, else as a full or shortened address.
    const primary = await getName(publicClient as never, {
      address: owner.address,
    }).catch(() => null)
    await expect(page.getByText('Owner', { exact: true })).toBeVisible({
      timeout: 30_000,
    })
    const ownerShown = page
      .locator(`main a[href$="/${owner.address}" i]`)
      .or(
        primary?.name
          ? page.getByText(primary.name, { exact: true })
          : page.locator(`main a[href$="/${owner.address}" i]`),
      )
    await expect(
      ownerShown.first(),
      'the profile must name the V1 owner',
    ).toBeVisible()
    if (process.env.QA_SHOTS_DIR)
      await page.screenshot({
        path: `${process.env.QA_SHOTS_DIR}/a11-reserved-profile.png`,
      })
  })
})

test.describe('ENS V1 → V2 migration — a large mixed batch', () => {
  // Seeding 24 names is ~6 minutes on the fork; the flow itself several more.
  test.describe.configure({ timeout: 1_200_000 })

  test('7 unwrapped, 8 unlocked and 9 locked names migrate in one flow, each through its own controller', {
    tag: ['@scenario:GS11'],
  }, async ({ migrationConnectedPage: page, wallet, accounts }) => {
    const owner = privateKeyToAccount(accounts.getPrivateKey('user'))
    const makeV1Name = createMakeV1Name({ userAccount: owner })
    const shapes = [
      ...Array.from({ length: 7 }, () => 'unwrapped' as const),
      ...Array.from({ length: 8 }, () => 'wrapped' as const),
      ...Array.from({ length: 9 }, () => 'locked' as const),
    ]
    const names: { name: string; type: (typeof shapes)[number] }[] = []
    for (const [i, type] of shapes.entries())
      names.push({
        name: await makeV1Name({ label: `gs11-${type}-${i}`, type }),
        type,
      })

    await serveV1Names(page, {
      ownerAddress: owner.address,
      roots: names.map(({ name, type }) => ({
        kind: 'registration' as const,
        label: labelOf(name),
        type,
      })),
    })
    await migrate(
      page,
      wallet,
      names.map((n) => n.name),
    )

    // Every name lands, and by the route its V1 shape dictates: unwrapped
    // and unlocked through the unlocked controller (an unlocked wrapper is
    // unwrapped into the Graveyard on the way), locked through the locked
    // controller with its wrapper kept.
    for (const { name, type } of names) {
      if (type === 'locked')
        await assertLockedTokenRoute(labelOf(name), namehash(name))
      else
        await assertUnlockedTokenRoute(labelOf(name), namehash(name), {
          wrapped: type === 'wrapped',
        })
    }
  })
})

test.describe('ENS V1 → V2 migration — more than one transaction (GA5)', () => {
  test.describe.configure({ timeout: 1_800_000 })

  test('a selection over the gas budget splits into several upgrade transactions: every one confirms, every name and record lands', {
    tag: ['@scenario:GA5'],
  }, async ({ migrationConnectedPage: page, wallet, accounts }) => {
    // The plan packs executions into transactions by estimated gas
    // (TARGET_GAS 15M; ~195k per unwrapped name, +50k per replayed text
    // record). Plain names would need ~70 to split; thirty records each make
    // a name ~1.8M, so twelve of them cannot fit in one transaction.
    const owner = privateKeyToAccount(accounts.getPrivateKey('user'))
    const makeV1Name = createMakeV1Name({ userAccount: owner })
    const records: V1Records = {
      texts: Array.from({ length: 30 }, (_, i) => ({
        key: `ga5.key-${String(i).padStart(2, '0')}`,
        value: `value ${i}`,
      })),
    }
    const names: string[] = []
    for (let i = 0; i < 12; i++) {
      const name = await makeV1Name({ label: `ga5-heavy-${i}` })
      await setV1RecordsOn(name, owner, false, records)
      names.push(name)
    }

    await serveV1Names(page, {
      ownerAddress: owner.address,
      roots: names.map((name) => ({
        kind: 'registration' as const,
        label: labelOf(name),
        records: { texts: records.texts?.map((t) => ({ ...t })) },
      })),
    })
    await openMigrationFlow(page)
    for (const name of names)
      await expect(rootRow(page, name)).toBeVisible({ timeout: 60_000 })
    await selectOnlyRoots(page, names)

    const plan = await readPlan(page)
    const upgradeSteps = plan.steps.filter((s) => /^Upgrade /.test(s))
    expect(
      upgradeSteps.length,
      `the plan splits the upgrade (${upgradeSteps.join(' · ')})`,
    ).toBeGreaterThan(1)

    const prompts = await upgradeCountingPrompts(page, wallet)
    expect(prompts, 'one wallet prompt per planned request').toBe(plan.count)

    for (const name of names) {
      await assertUnlockedTokenRoute(labelOf(name), namehash(name), {
        wrapped: false,
      })
      await expectRecordsResolve(name, records)
    }
  })
})

test.describe('ENS V1 → V2 migration — names the controllers cannot claim', () => {
  test.describe.configure({ timeout: 300_000 })

  test('a V1 name with no V2 reservation is listed as not upgradable, with that reason', {
    tag: ['@scenario:GA12'],
  }, async ({ migrationConnectedPage: page, accounts }) => {
    test.skip(
      isRealBigname,
      'the local bigname answers not_found for a V1 name with no V2 entry, so it never lists it; the not-reserved bucket needs the route mock',
    )
    const owner = privateKeyToAccount(accounts.getPrivateKey('user'))
    const makeV1Name = createMakeV1Name({ userAccount: owner })
    const unreserved = await makeV1Name({
      label: 'ga12-unreserved',
      reserveInV2: false,
    })
    const control = await makeV1Name({ label: 'ga12-control' })
    expect(
      await readV2Status(labelOf(unreserved)),
      'precondition: no V2 entry at all (AVAILABLE)',
    ).toBe(0)

    await serveV1Names(page, {
      ownerAddress: owner.address,
      roots: [
        { kind: 'registration', label: labelOf(unreserved), unreserved: true },
        { kind: 'registration', label: labelOf(control) },
      ],
    })
    await openMigrationFlow(page)
    await expect(rootRow(page, control)).toBeVisible({ timeout: 60_000 })
    await expect(
      rootRow(page, unreserved),
      'a name the controller cannot claim is not selectable',
    ).toHaveCount(0)
    await expect(
      page.getByRole('heading', { name: "These names can't be upgraded" }),
    ).toBeVisible()
    await expect(
      page.getByRole('listitem').filter({ hasText: unreserved }),
      'the name is listed with the reason',
    ).toContainText('it has no ENSv2 reservation.')
  })

  /** Migrate `gm5-…` with a control beside it, then reopen /upgrade with the stale listing. */
  async function reopenAfterMigrating(
    page: Page,
    wallet: Parameters<typeof confirmAndAuthorize>[1],
    owner: ReturnType<typeof privateKeyToAccount>,
  ): Promise<{ done: string; control: string }> {
    const makeV1Name = createMakeV1Name({ userAccount: owner })
    const done = await makeV1Name({ label: 'gm5-done' })
    const control = await makeV1Name({ label: 'gm5-control' })
    await serveV1Names(page, {
      ownerAddress: owner.address,
      roots: [done, control].map((name) => ({
        kind: 'registration' as const,
        label: labelOf(name),
      })),
    })
    await migrate(page, wallet, [done])
    await assertUnlockedTokenRoute(labelOf(done), namehash(done), {
      wrapped: false,
    })
    // A fresh page with the same stale listing: the index still says V1.
    await page.reload()
    await openMigrationFlow(page)
    await expect(rootRow(page, control)).toBeVisible({ timeout: 60_000 })
    return { done, control }
  }

  test('a name that already migrated is not offered again, even while the index still lists it as V1', {
    tag: ['@scenario:GU6'],
  }, async ({ migrationConnectedPage: page, wallet, accounts }) => {
    test.skip(
      isRealBigname,
      'a live bigname flips the name to ENSv2 within a second; the stale listing needs the route mock',
    )
    const owner = privateKeyToAccount(accounts.getPrivateKey('user'))
    const { done } = await reopenAfterMigrating(page, wallet, owner)
    await expect(
      rootRow(page, done),
      'an already-migrated name must not be selectable again',
    ).toHaveCount(0)
  })

  test('an already-migrated name the index still lists is shown with the reason', {
    tag: ['@scenario:GM5'],
  }, async ({ migrationConnectedPage: page, wallet, accounts }) => {
    test.skip(
      isRealBigname,
      'a live bigname flips the name to ENSv2 within a second; the stale listing needs the route mock',
    )
    test.fail(
      true,
      'E2E-026: `already-migrated` is never emitted; the name silently drops off the list',
    )
    const owner = privateKeyToAccount(accounts.getPrivateKey('user'))
    const { done } = await reopenAfterMigrating(page, wallet, owner)
    await expect(
      page.getByRole('listitem').filter({ hasText: done }),
      'the name is accounted for, with why it cannot be upgraded',
    ).toContainText(/already (been )?upgraded|already migrated/i, {
      timeout: 15_000,
    })
  })
})
