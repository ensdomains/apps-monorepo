/**
 * Migration deep into, and after, the V1 grace period (GA7, GA8).
 *
 * **This file moves the shared fork clock 91 days forward, permanently.** It
 * runs in its own project (`manager-migration-time`), after every other
 * migration spec, and nothing may depend on the clock it leaves behind.
 *
 * Mechanics (contracts-v2 `AbstractETHRegistrar.renew` / `ETHRenewerV1`):
 * pre-migration reserves a V1 name in V2 until `v1Expiry + PREMIGRATION_BONUS`
 * (62 days). Renewing sets the V2 expiry to `reservedExpiry + duration` *and*
 * extends V1 by the same `duration`. The migration then registers the slot with
 * its reserved expiry. So after renew-then-upgrade the V2 expiry is exactly the
 * renewed V1 expiry plus the bonus — the relationship GA7 asserts at day 45
 * (slot still RESERVED) and day 89 (slot already lapsed to AVAILABLE, inside
 * the renewer's 28-day window). Past day 90 the renewer refuses, so the name
 * must not be offered at all (GA8).
 *
 * Seeded with `makeGraceV1Name` (a ~90 s registration reserved with the real
 * bonus), then the clock is walked so three names sit at day 91, 89 and 45.
 */
import { ensL1Contracts, supportedL1Chains } from '@ensdomains/ensjs/chain'
import { labelToCanonicalId } from '@ensdomains/ensjs/utils/v2'
import { Web3RequestKind } from '@ensdomains/headless-web3-provider'
import type { Page } from '@playwright/test'
import {
  type Address,
  encodeFunctionData,
  keccak256,
  namehash,
  parseAbi,
  toHex,
  zeroAddress,
} from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import {
  type GraceV1Name,
  makeGraceV1Name,
  PREMIGRATION_BONUS_PERIOD,
  syncBrowserToChain,
} from '../../../fixtures/makeGraceV1Name.js'
import {
  createMakeV1Name,
  reserveInV2,
  V1_ENS_REGISTRY,
} from '../../../fixtures/makeV1Name.js'
import {
  authorizeTransactionsWhile,
  expect,
  test,
} from '../../../fixtures/playwright.manager.fixture.js'
import { discoverV1CompatResolver } from '../../../fixtures/premigration.js'
import {
  APP_V1_CONTROLLER,
  ensureV1ControllersAuthorised,
} from '../../../fixtures/v1-controller-auth.js'
import { setV1RecordsOn, type V1Records } from '../../../fixtures/v1-records.js'
import {
  publicClient,
  testClient,
  walletClient,
} from '../../../helpers/anvil-client.js'
import {
  isRealBigname,
  waitForBignameBlock,
} from '../../../helpers/bigname-sync.js'
import {
  assertUnlockedMigration,
  assertV2Reserved,
  readGraveyard,
} from '../../../helpers/migration-assertions.js'
import { selectOnlyRoots } from '../../../helpers/migration-flow.js'
import type { MockV1Name } from '../../../helpers/mock-v1-subgraph.js'
import { renewFor28Days } from '../../../helpers/profile-helpers.js'
import {
  dnsEncode,
  expectRecordsResolve,
  resolveRecords,
  resolverFor,
} from '../../../helpers/resolve-records.js'
import { serveV1Names } from '../../../helpers/v1-names.js'

const MANAGER_APP_URL = process.env.MANAGER_APP_URL ?? 'http://localhost:3000'

const sepolia = ensL1Contracts[supportedL1Chains.sepolia]
const BASE_REGISTRAR = sepolia.ensBaseRegistrarImplementation.address as Address
const ETH_REGISTRY = sepolia.ensRegistry.address as Address
const ETH_REGISTRAR = sepolia.ensEthRegistrar.address as Address
const RENEWER = sepolia.ensEthRenewerV1.address as Address

const DAY = 24 * 60 * 60

const BASE_REGISTRAR_ABI = parseAbi([
  'function nameExpires(uint256 id) view returns (uint256)',
  'function renew(uint256 id, uint256 duration) returns (uint256)',
])
const NAME_WRAPPER = sepolia.ensNameWrapper.address as Address
const GRAVEYARD_ABI = parseAbi(['function clear(bytes[] names)'])
const V1_TOKEN_ABI = parseAbi([
  'function ownerOf(uint256 tokenId) view returns (address)',
])
const V1_REGISTRY_ABI = parseAbi([
  'function owner(bytes32 node) view returns (address)',
  'function resolver(bytes32 node) view returns (address)',
])
const V2_RESOLVER_ABI = parseAbi([
  'function getResolver(string label) view returns (address)',
])
const NAME_WRAPPER_ABI = parseAbi([
  'function getData(uint256 tokenId) view returns (address owner, uint32 fuses, uint64 expiry)',
])
const REGISTRY_ABI = parseAbi([
  'struct State { uint8 status; uint64 expiry; address latestOwner; uint256 tokenId; uint256 resource; }',
  'function getState(uint256 anyId) view returns (State state)',
])
const RENEWER_ABI = parseAbi([
  'function isRenewable(string label) view returns (bool)',
])
const REGISTER_PRICE_ABI_A24 = parseAbi([
  'function getRegisterPrice(string label, uint64 duration, address paymentToken) view returns (uint256 base, uint256 premium)',
])
const RENEW_PRICE_ABI = parseAbi([
  'function getRenewPrice(string label, uint64 duration, address paymentToken) view returns (uint256)',
])
const REGISTRAR_ABI = parseAbi([
  'function isAvailable(string label) view returns (bool)',
])

const AVAILABLE = 0

const warpDays = async (days: number) => {
  await testClient.increaseTime({ seconds: Math.round(days * DAY) })
  await testClient.mine({ blocks: 1 })
}

const chainNow = async () =>
  (await publicClient.getBlock({ blockTag: 'latest', cacheTime: 0 } as never))
    .timestamp

const graceDay = async (grace: GraceV1Name) =>
  Number((await chainNow()) - grace.expiry) / DAY

const v1Expiry = (grace: GraceV1Name) =>
  publicClient.readContract({
    address: BASE_REGISTRAR,
    abi: BASE_REGISTRAR_ABI,
    functionName: 'nameExpires',
    args: [grace.tokenId],
  })

const v2State = (label: string) =>
  publicClient.readContract({
    address: ETH_REGISTRY,
    abi: REGISTRY_ABI,
    functionName: 'getState',
    args: [labelToCanonicalId(label)],
  })

const graceMock = (grace: GraceV1Name, owner: Address): MockV1Name => ({
  name: grace.name,
  ownerAddress: owner,
  type: 'unwrapped',
  expiryDate: Number(grace.expiry),
})

/** The checkbox for a name on /upgrade, once the list has rendered. */
const nameCheckbox = (page: Page, name: string) =>
  page.getByRole('checkbox', { name, exact: true })

test.describe('Migration deep into and after the V1 grace period', () => {
  test.describe.configure({ timeout: 600_000 })

  test('renew-then-upgrade works at grace day 45 and day 89 with V2 expiry = renewed V1 expiry + bonus; past grace the name is not offered and is open to registration', {
    tag: ['@scenario:GA7', '@scenario:GA8'],
  }, async ({ migrationConnectedPage: page, wallet, accounts }) => {
    const owner = privateKeyToAccount(accounts.getPrivateKey('user'))

    // ── Walk the clock: one name per point in the grace period ──
    const lapsed = await makeGraceV1Name({ label: 'ga8-lapsed', owner })
    await warpDays(2)
    const day89 = await makeGraceV1Name({ label: 'ga7-day89', owner })
    await warpDays(44)
    const day45 = await makeGraceV1Name({ label: 'ga7-day45', owner })
    await warpDays(45)

    expect(await graceDay(day45)).toBeGreaterThan(44.9)
    expect(await graceDay(day45)).toBeLessThan(45.1)
    expect(await graceDay(day89)).toBeGreaterThan(88.9)
    expect(await graceDay(day89)).toBeLessThan(90)
    expect(await graceDay(lapsed)).toBeGreaterThan(90)

    // The three V2 states the app has to handle.
    await assertV2Reserved(day45.label)
    expect(
      (await v2State(day89.label)).status,
      'day 89: reservation lapsed',
    ).toBe(AVAILABLE)
    for (const [grace, renewable] of [
      [day45, true],
      [day89, true],
      [lapsed, false],
    ] as const) {
      expect(
        await publicClient.readContract({
          address: RENEWER,
          abi: RENEWER_ABI,
          functionName: 'isRenewable',
          args: [grace.label],
        }),
        `isRenewable(${grace.label})`,
      ).toBe(renewable)
    }

    // A plain active name, seeded after the warps: the control that proves
    // the list rendered at all when the lapsed name is absent.
    const control = await createMakeV1Name({ userAccount: owner })({
      label: 'ga8-control',
    })

    await serveV1Names(page, [
      graceMock(lapsed, owner.address),
      graceMock(day89, owner.address),
      graceMock(day45, owner.address),
      { name: control, ownerAddress: owner.address, type: 'unwrapped' },
    ])
    await syncBrowserToChain(page)
    await page.goto(`${MANAGER_APP_URL}/upgrade`)

    // ── GA8: past grace, not offered ──
    await expect(nameCheckbox(page, control)).toBeVisible({ timeout: 60_000 })
    await expect(nameCheckbox(page, day45.name)).toBeVisible()
    await expect(nameCheckbox(page, day89.name)).toBeVisible()
    await expect(
      page.getByText(lapsed.name, { exact: true }),
      'a name past its grace period must not be offered for upgrade',
    ).toHaveCount(0)

    // ── GA7: renew then upgrade the two grace names (not the control) ──
    // `selectOnlyRoots`, not "untick the control": on a real index the shared
    // wallet lists every name it ever made, all ticked by default.
    await selectOnlyRoots(page, [day45.name, day89.name])
    await expect(nameCheckbox(page, control)).not.toBeChecked()
    for (const grace of [day45, day89])
      await expect(nameCheckbox(page, grace.name)).toBeChecked()

    const upgrade = page.getByRole('button', { name: /^Upgrade 2 names$/ })
    await expect(upgrade).toBeEnabled({ timeout: 90_000 })
    let done = false
    const authorizeAll = authorizeTransactionsWhile(page, wallet, () => done)
    await upgrade.click()
    await expect(
      page.getByRole('heading', { name: /your names have been upgraded/i }),
    ).toBeVisible({ timeout: 240_000 })
    done = true
    await authorizeAll

    const now = await chainNow()
    for (const grace of [day45, day89]) {
      const renewed = await v1Expiry(grace)
      expect(renewed, `${grace.label}: V1 renewed past now`).toBeGreaterThan(
        now,
      )
      await assertUnlockedMigration(grace.label)
      const state = await v2State(grace.label)
      expect(
        BigInt(state.expiry),
        `${grace.label}: V2 expiry must be the renewed V1 expiry plus the pre-migration bonus`,
      ).toBe(renewed + PREMIGRATION_BONUS_PERIOD)
    }

    // ── GA8: …and the lapsed name is open to anyone ──
    expect(
      await publicClient.readContract({
        address: ETH_REGISTRAR,
        abi: REGISTRAR_ABI,
        functionName: 'isAvailable',
        args: [lapsed.label],
      }),
      'a name past V1 grace must be available to register in V2',
    ).toBe(true)
    await page.goto(`${MANAGER_APP_URL}/register/${lapsed.name}`)
    await expect(page).toHaveURL(new RegExp(`/register/${lapsed.label}`), {
      timeout: 30_000,
    })
  })
})

test.describe('Migration of a desynced 2LD (§G.GW)', () => {
  test.describe.configure({ timeout: 600_000 })

  test('a 2LD renewed on the registrar but expired in the NameWrapper is accounted for on /upgrade', {
    tag: ['@scenario:GW4'],
  }, async ({ migrationConnectedPage: page, accounts }) => {
    // The bigname route mock has one expiry for registrar and wrapper; the
    // disagreement is the whole shape, so only a live index can serve it.
    test.skip(
      !isRealBigname,
      'needs the local bigname: the mock cannot split the two expiries',
    )
    test.fail(
      true,
      'E2E-027: a desynced wrapped 2LD has no owner in the index, so the owner never sees it and is never offered syncWrapper',
    )
    const owner = privateKeyToAccount(accounts.getPrivateKey('user'))
    const makeV1Name = createMakeV1Name({ userAccount: owner })

    // ens-app-v3 `registrationStatus` "desynced": the registrar expiry is in
    // the future, the NameWrapper reports owner 0. It arises when a wrapped
    // name is renewed on the registrar alone (a legacy controller) — the
    // wrapper's own expiry never moves, lapses, and with PARENT_CANNOT_CONTROL
    // burnt (every wrapped .eth 2LD) the wrapper zeroes the owner.
    const name = await makeV1Name({
      label: 'gw4-desync',
      type: 'wrapped',
      duration: 28 * DAY,
      reserveInV2: false,
    })
    const label = name.replace(/\.eth$/, '')
    const tokenId = BigInt(keccak256(toHex(label)))

    await ensureV1ControllersAuthorised()
    await testClient.impersonateAccount({ address: APP_V1_CONTROLLER })
    await testClient.setBalance({
      address: APP_V1_CONTROLLER,
      value: 10n ** 19n,
    })
    try {
      const hash = await walletClient.sendTransaction({
        account: APP_V1_CONTROLLER,
        to: BASE_REGISTRAR,
        data: encodeFunctionData({
          abi: BASE_REGISTRAR_ABI,
          functionName: 'renew',
          args: [tokenId, BigInt(365 * DAY)],
        }),
      })
      const receipt = await publicClient.waitForTransactionReceipt({ hash })
      expect(receipt.status, 'registrar-only renewal').toBe('success')
    } finally {
      await testClient.stopImpersonatingAccount({ address: APP_V1_CONTROLLER })
    }
    const registrarExpiry = await publicClient.readContract({
      address: BASE_REGISTRAR,
      abi: BASE_REGISTRAR_ABI,
      functionName: 'nameExpires',
      args: [tokenId],
    })
    // Reserve in V2 at the renewed expiry, so a lapsed reservation cannot be
    // why the name is missing.
    await reserveInV2(label, registrarExpiry)

    // Past the wrapper's expiry (registrar + 90 days, from the 28-day lease).
    await warpDays(28 + 90 + 2)
    const [wrapperOwner, , wrapperExpiry] = await publicClient.readContract({
      address: NAME_WRAPPER,
      abi: NAME_WRAPPER_ABI,
      functionName: 'getData',
      args: [BigInt(namehash(name))],
    })
    const now = await chainNow()
    expect(
      registrarExpiry,
      'precondition: the registrar lease is live',
    ).toBeGreaterThan(now)
    expect(wrapperExpiry, 'precondition: the wrapper has lapsed').toBeLessThan(
      now,
    )
    expect(wrapperOwner, 'precondition: the wrapper reports no owner').toBe(
      zeroAddress,
    )
    expect(await v2State(label)).toMatchObject({ status: 1 })

    // A fresh, ordinary name after the warp: the list rendered at all.
    const control = await makeV1Name({ label: 'gw4-control', type: 'wrapped' })

    await serveV1Names(page, [
      { name, ownerAddress: owner.address, type: 'wrapped' },
      { name: control, ownerAddress: owner.address, type: 'wrapped' },
    ])
    await syncBrowserToChain(page)
    await page.goto(`${MANAGER_APP_URL}/upgrade`)
    await expect(nameCheckbox(page, control)).toBeVisible({ timeout: 60_000 })
    // INV3: every input lands in a visible bucket — offered, or listed as not
    // upgradable with a reason. Silence is the one wrong answer.
    await expect(
      page.getByText(name, { exact: false }).first(),
      'the desynced name is accounted for',
    ).toBeVisible({ timeout: 15_000 })
  })
})

test.describe('An unmigrated V1 name after its V1 expiry (GA9)', () => {
  test.describe.configure({ timeout: 600_000 })

  test('resolves through the ENSV1Resolver until the V2 reservation lapses; after V1 grace anyone can clear it into the Graveyard', {
    tag: ['@scenario:GA9'],
  }, async ({ accounts }) => {
    const owner = privateKeyToAccount(accounts.getPrivateKey('user'))
    const stranger = privateKeyToAccount(accounts.getPrivateKey('user2'))
    // Registered, reserved in V2 at expiry + PREMIGRATION_BONUS_PERIOD (as
    // premigration does), and stepped just past its V1 expiry E.
    const g = await makeGraceV1Name({ label: 'ga9-unmigrated', owner })
    const records: V1Records = {
      texts: [{ key: 'description', value: 'never migrated' }],
    }
    await setV1RecordsOn(g.name, owner, false, records)
    const compat = await discoverV1CompatResolver()

    // ── E … E + bonus: RESERVED, V1 data served through the ENSV1Resolver ──
    expect(await v2State(g.label)).toMatchObject({ status: 1 })
    expect(
      (await resolverFor(g.name)).toLowerCase(),
      'the V2 registry routes the name to the ENSV1Resolver',
    ).toBe(compat.toLowerCase())
    await expectRecordsResolve(g.name, records)

    // ── past E + bonus: the reservation lapses, so does resolution ──
    await warpDays(Number(PREMIGRATION_BONUS_PERIOD) / DAY + 1)
    expect((await v2State(g.label)).status, 'AVAILABLE in V2').toBe(AVAILABLE)
    expect(
      await publicClient.readContract({
        address: ETH_REGISTRY,
        abi: V2_RESOLVER_ABI,
        functionName: 'getResolver',
        args: [g.label],
      }),
      'an expired reservation has no resolver',
    ).toBe(zeroAddress)
    const [lapsed] = await resolveRecords(g.name, records)
    expect(lapsed.got, 'the V1 records no longer resolve').not.toBe(lapsed.want)

    // ── still inside V1 grace: the Graveyard cannot take it yet ──
    const graveyard = await readGraveyard()
    const clear = () =>
      walletClient.sendTransaction({
        account: stranger,
        to: graveyard,
        data: encodeFunctionData({
          abi: GRAVEYARD_ABI,
          functionName: 'clear',
          args: [[dnsEncode(g.name)]],
        }),
      })
    await expect(clear(), 'not clearable inside V1 grace').rejects.toThrow()

    // ── past E + 90 days: anyone may clear it ──
    await warpDays(90 - Number(PREMIGRATION_BONUS_PERIOD) / DAY)
    const hash = await clear()
    expect(
      (await publicClient.waitForTransactionReceipt({ hash })).status,
      'a stranger clears the expired V1 name',
    ).toBe('success')

    const node = namehash(g.name)
    const [registrant, registryOwner, v1Resolver] = await Promise.all([
      publicClient.readContract({
        address: BASE_REGISTRAR,
        abi: V1_TOKEN_ABI,
        functionName: 'ownerOf',
        args: [g.tokenId],
      }),
      publicClient.readContract({
        address: V1_ENS_REGISTRY,
        abi: V1_REGISTRY_ABI,
        functionName: 'owner',
        args: [node],
      }),
      publicClient.readContract({
        address: V1_ENS_REGISTRY,
        abi: V1_REGISTRY_ABI,
        functionName: 'resolver',
        args: [node],
      }),
    ])
    expect(registrant, 'the V1 token sits in the Graveyard').toBe(graveyard)
    expect(registryOwner, 'so does the registry record').toBe(graveyard)
    expect(v1Resolver, 'and its V1 resolver is cleared').toBe(zeroAddress)
    expect(
      await publicClient.readContract({
        address: ETH_REGISTRAR,
        abi: REGISTRAR_ABI,
        functionName: 'isAvailable',
        args: [g.label],
      }),
      'and the name is open to register in V2',
    ).toBe(true)
  })
})

/**
 * Renew by the minimum on /renew-v1. The V1 path pays from the owner's EOA —
 * a USDC approve (when the allowance is short) then `ETHRenewerV1.renew` —
 * so every send the flow asks for is authorized until it reports success.
 */
async function renewV1(
  page: Page,
  wallet: Parameters<typeof authorizeTransactionsWhile>[1],
): Promise<void> {
  // The date picker ignores a click made before pricing has loaded.
  await expect(
    page.getByRole('button', { name: /pay with stablecoins/i }),
  ).toBeVisible({ timeout: 60_000 })
  await page.waitForLoadState('networkidle')
  let done = false
  const authorizing = authorizeTransactionsWhile(page, wallet, () => done)
  try {
    await renewFor28Days(page)
  } finally {
    done = true
    await authorizing
  }
}

test.describe('V1 renewal through ETHRenewerV1 (§5.B)', () => {
  test.describe.configure({ timeout: 600_000 })

  const wrapperExpiry = async (name: string) =>
    (
      await publicClient.readContract({
        address: NAME_WRAPPER,
        abi: NAME_WRAPPER_ABI,
        functionName: 'getData',
        args: [BigInt(namehash(name))],
      })
    )[2]

  test('renewing a wrapped V1 name in grace also moves its NameWrapper expiry', {
    tag: ['@scenario:B15'],
  }, async ({ migrationConnectedPage: page, wallet, accounts }) => {
    const owner = privateKeyToAccount(accounts.getPrivateKey('user'))
    // In grace, reserved in V2 with the premigration bonus — renewable.
    const g = await makeGraceV1Name({
      label: 'b15-wrapped',
      owner,
      wrapped: true,
    })
    const before = await v1Expiry(g)
    expect(
      await wrapperExpiry(g.name),
      'precondition: a wrapped .eth 2LD carries registrar expiry + 90 days',
    ).toBe(before + 90n * BigInt(DAY))

    await serveV1Names(page, [
      {
        name: g.name,
        ownerAddress: owner.address,
        type: 'wrapped',
        expiryDate: Number(g.expiry),
      },
    ])
    await syncBrowserToChain(page)
    await page.goto(`${MANAGER_APP_URL}/renew-v1/${g.name}`)
    await renewV1(page, wallet)

    const after = await v1Expiry(g)
    expect(after - before, 'the registrar lease moved by 28 days').toBe(
      28n * BigInt(DAY),
    )
    // Unsynced, the wrapper would lapse at the OLD expiry + 90 days and the
    // name would desync (E2E-027's state). The deployed ETHRenewerV1 renews
    // through the wrapped controller inline (NameWrapper.renew), so it does
    // not — this pins that.
    expect(
      await wrapperExpiry(g.name),
      'the NameWrapper expiry follows the renewed lease',
    ).toBe(after + 90n * BigInt(DAY))
  })

  test('renewing an unwrapped V1 name in grace moves its lease, and touches no wrapper', {
    tag: ['@scenario:B14', '@scenario:B15'],
  }, async ({ migrationConnectedPage: page, wallet, accounts }) => {
    const owner = privateKeyToAccount(accounts.getPrivateKey('user'))
    const g = await makeGraceV1Name({ label: 'b14-unwrapped', owner })
    const before = await v1Expiry(g)
    const reservationBefore = (await v2State(g.label)).expiry

    await serveV1Names(page, [
      {
        name: g.name,
        ownerAddress: owner.address,
        type: 'unwrapped',
        expiryDate: Number(g.expiry),
      },
    ])
    await syncBrowserToChain(page)
    await page.goto(`${MANAGER_APP_URL}/renew-v1/${g.name}`)
    await renewV1(page, wallet)

    const after = await v1Expiry(g)
    expect(after - before, 'the registrar lease moved by 28 days').toBe(
      28n * BigInt(DAY),
    )
    expect(await wrapperExpiry(g.name), 'no wrapper exists to sync').toBe(0n)
    // The deployed ETHRenewerV1 renews the V2 reservation in the same call
    // (traced 2026-10-11; the local contracts-v2 source predates this), so
    // the reservation keeps step with the lease.
    expect(
      (await v2State(g.label)).expiry - reservationBefore,
      'the V2 reservation moved with the lease',
    ).toBe(28n * BigInt(DAY))
  })

  test('the continuity bonus: renewing on grace day 61 and day 63 both re-reserve V2 at renewed V1 expiry + bonus', {
    tag: ['@scenario:B16'],
  }, async ({ migrationConnectedPage: page, wallet, accounts }) => {
    const owner = privateKeyToAccount(accounts.getPrivateKey('user'))
    // Two names whose V1 leases end two days apart, so one warp puts the
    // first at grace day 63 (past the 62-day bonus window) and the second at
    // day 61 (inside it).
    const late = await makeGraceV1Name({ label: 'b16-day63', owner })
    await warpDays(2)
    const early = await makeGraceV1Name({ label: 'b16-day61', owner })
    await warpDays(61)
    expect(await graceDay(early)).toBeGreaterThan(60.9)
    expect(await graceDay(early)).toBeLessThan(62)
    expect(await graceDay(late)).toBeGreaterThan(62.9)
    expect((await v2State(early.label)).status, 'day 61: still RESERVED').toBe(
      1,
    )
    expect(
      (await v2State(late.label)).status,
      'day 63: reservation lapsed',
    ).toBe(AVAILABLE)

    const measured: Record<string, bigint> = {}
    for (const g of [early, late]) {
      await serveV1Names(page, [
        {
          name: g.name,
          ownerAddress: owner.address,
          type: 'unwrapped',
          expiryDate: Number(g.expiry),
        },
      ])
      await syncBrowserToChain(page)
      await page.goto(`${MANAGER_APP_URL}/renew-v1/${g.name}`)
      await renewV1(page, wallet)
      const leased = await v1Expiry(g)
      const state = await v2State(g.label)
      measured[g.label] = state.expiry - leased
      console.log(
        `[B16] ${g.label}: V2 status ${state.status}, V2 expiry − V1 expiry = ${measured[g.label]}s`,
      )
    }
    // The bonus is not a window that closes at day 62: it is the offset that
    // lines V1's 90-day grace up with V2's 28 (premigration reserves every
    // name at V1 expiry + bonus), and every renewal restores it — inside the
    // reservation (day 61) and after it lapsed but while still renewable
    // (day 63), as GA7 measured at day 89.
    expect(measured[early.label], 'day 61: V2 = renewed V1 + bonus').toBe(
      PREMIGRATION_BONUS_PERIOD,
    )
    expect(
      measured[late.label],
      'day 63: re-reserved at renewed V1 + bonus',
    ).toBe(PREMIGRATION_BONUS_PERIOD)
  })
})

test.describe('Grace on the dashboard (§5.B)', () => {
  test.describe.configure({ timeout: 600_000 })

  /** A dashboard row: the outermost element holding one "More options" control. */
  const rowOf = (page: Page, name: string) =>
    page
      .getByRole('button', { name: `More options for ${name}`, exact: true })
      .locator(
        'xpath=ancestor::div[count(.//button[starts-with(@aria-label,"More options for")])=1][last()]',
      )

  const openDashboard = async (page: Page, name: string) => {
    await waitForBignameBlock()
    await page.goto(`${MANAGER_APP_URL}/dashboard`)
    // Typing before the list has loaded is wiped by its first render.
    await expect(
      page.getByRole('button', { name: /^Select all names$/ }),
    ).toBeVisible({ timeout: 60_000 })
    const search = page.getByPlaceholder('Search my names')
    await search.fill(name.replace(/\.eth$/, ''))
    await expect(search).toHaveValue(name.replace(/\.eth$/, ''))
    await expect(
      page.getByRole('button', {
        name: `More options for ${name}`,
        exact: true,
      }),
    ).toBeVisible({ timeout: 60_000 })
  }

  test('a name in grace carries the badge and banner until it is renewed, then neither', {
    tag: ['@scenario:B6'],
  }, async ({ migrationConnectedPage: page, makeV2Name, wallet }) => {
    test.skip(
      !isRealBigname,
      'renewal has to reach the index the dashboard reads',
    )
    const name = await makeV2Name({ label: 'b6-grace', duration: -3 * DAY })
    const label = name.replace(/\.eth$/, '')
    const before = (await v2State(label)).expiry
    await syncBrowserToChain(page)

    await openDashboard(page, name)
    await expect(
      rowOf(page, name).getByText('Grace period').first(),
      'in grace: the badge is on its row',
    ).toBeVisible()

    await page.goto(`${MANAGER_APP_URL}/renew/${name}`)
    await renewV1(page, wallet)
    expect((await v2State(label)).expiry - before, 'renewed by 28 days').toBe(
      28n * BigInt(DAY),
    )

    await openDashboard(page, name)
    await expect(
      rowOf(page, name).getByText('Grace period'),
      'renewed: the badge is gone',
    ).toHaveCount(0, { timeout: 30_000 })
    await expect(
      page.locator(`a[href="/renew/${name}"]`).filter({ hasText: /^Renew$/ }),
      'and no grace banner offers to renew it',
    ).toHaveCount(0)
  })

  test('bulk renew an active name and a name in grace: the total is the sum of on-chain prices, and both leases move', {
    tag: ['@scenario:B8', '@scenario:B10'],
  }, async ({ migrationConnectedPage: page, makeV2Name, wallet }) => {
    test.skip(
      !isRealBigname,
      'renewal has to reach the index the dashboard reads',
    )
    const tag = `b8${Date.now().toString(36)}`
    // The grace name first: its fixture warps the clock past its expiry, which
    // would also expire an active name made before it.
    const grace = await makeV2Name({ label: `${tag}g`, duration: -2 * DAY })
    const active = await makeV2Name({ label: `${tag}a` })
    const names = [active, grace]
    const labels = names.map((n) => n.replace(/\.eth$/, ''))
    const before = await Promise.all(
      labels.map(async (l) => (await v2State(l)).expiry),
    )
    await syncBrowserToChain(page)

    await waitForBignameBlock()
    await page.goto(`${MANAGER_APP_URL}/dashboard`)
    await expect(
      page.getByRole('button', { name: /^Select all names$/ }),
    ).toBeVisible({
      timeout: 60_000,
    })
    const search = page.getByPlaceholder('Search my names')
    await search.fill(tag)
    await expect(search).toHaveValue(tag)
    for (const name of names)
      await page
        .getByRole('button', { name: `Select ${name}`, exact: true })
        .click()
    await page.getByRole('button', { name: 'Renew', exact: true }).click()

    const dialog = page.getByRole('dialog')
    await expect(dialog.getByText('Total:').first()).toBeVisible({
      timeout: 30_000,
    })
    const readTotal = async () => {
      const text = await dialog.innerText()
      const match = text.match(/Total:\s*\$([\d,]+\.\d{2})/)
      return match ? Number(match[1].replace(/,/g, '')) : Number.NaN
    }
    await expect.poll(readTotal, { timeout: 30_000 }).toBeGreaterThan(0)
    const shownTotal = await readTotal()

    await dialog.getByRole('button', { name: 'Next', exact: true }).click()
    await expect(dialog.getByText('Select payment')).toBeVisible()
    await dialog.getByRole('button', { name: /USDC/ }).first().click()
    let done = false
    const authorizing = authorizeTransactionsWhile(page, wallet, () => done)
    await dialog.getByRole('button', { name: 'Confirm', exact: true }).click()
    await expect(page.getByText('Renewal Complete')).toBeVisible({
      timeout: 120_000,
    })
    done = true
    await authorizing

    // B8: every lease advanced, by its own calendar year.
    const after = await Promise.all(
      labels.map(async (l) => (await v2State(l)).expiry),
    )
    const durations = after.map((a, i) => a - before[i])
    for (const [i, d] of durations.entries())
      expect(
        d,
        `${names[i]} renewed by a calendar year`,
      ).toBeGreaterThanOrEqual(365n * BigInt(DAY))

    // B10: the dialog's total equals the registrar's own price for each name
    // over the duration it actually applied, summed — read independently.
    const prices = await Promise.all(
      labels.map((label, i) =>
        publicClient.readContract({
          address: ETH_REGISTRAR,
          abi: RENEW_PRICE_ABI,
          functionName: 'getRenewPrice',
          args: [
            label,
            durations[i],
            ensL1Contracts[supportedL1Chains.sepolia].usdc.address as Address,
          ],
        }),
      ),
    )
    const onChainTotal = Number(prices.reduce((a, b) => a + b, 0n)) / 1e6
    console.log(
      `[B10] shown $${shownTotal}, on chain $${onChainTotal.toFixed(6)}`,
    )
    expect(
      Math.abs(shownTotal - onChainTotal),
      'total = Σ per-name price',
    ).toBeLessThan(0.01)
  })

  test('a name past its grace cannot be extended: renewal is not offered', {
    tag: ['@scenario:B4'],
  }, async ({ migrationConnectedPage: page, makeV2Name }) => {
    test.fail(
      true,
      'E2E-029: /renew offers a full renewal (with "Pay with stablecoins") for a name past grace',
    )
    const name = await makeV2Name({ label: 'b4-lapsed', duration: -30 * DAY })
    const label = name.replace(/\.eth$/, '')
    const state = await v2State(label)
    expect(state.status, 'past grace: AVAILABLE on chain').toBe(AVAILABLE)
    await expect(
      publicClient.readContract({
        address: ETH_REGISTRAR,
        abi: RENEW_PRICE_ABI,
        functionName: 'getRenewPrice',
        args: [
          label,
          BigInt(28 * DAY),
          ensL1Contracts[supportedL1Chains.sepolia].usdc.address as Address,
        ],
      }),
      'the registrar will not price a renewal',
    ).rejects.toThrow()

    await waitForBignameBlock()
    await syncBrowserToChain(page)
    await page.goto(`${MANAGER_APP_URL}/renew/${name}`)
    // Blocked or shown as available — either is honest; offering to take
    // payment for a renewal the registrar refuses is not.
    await expect(
      page
        .getByRole('heading', { name: /available|can.t be renewed|expired/i })
        .or(
          page.getByText(
            /is available|can.t be renewed|grace period has ended/i,
          ),
        )
        .first(),
      'the page says the name is lapsed or available',
    ).toBeVisible({ timeout: 30_000 })
    await expect(
      page.getByRole('button', { name: /pay with stablecoins/i }),
      'no renewal is offered',
    ).toHaveCount(0)
  })

  test('bulk renew with the second renewal refused: the first stays renewed, and a retry finishes the rest without charging the first again', {
    tag: ['@scenario:B9'],
  }, async ({ migrationConnectedPage: page, makeV2Name, wallet }) => {
    test.skip(
      !isRealBigname,
      'the dashboard has to list the names from the real index',
    )
    test.setTimeout(600_000)
    const tag = `b9${Date.now().toString(36)}`
    const names = [
      await makeV2Name({ label: `${tag}a` }),
      await makeV2Name({ label: `${tag}b` }),
      await makeV2Name({ label: `${tag}c` }),
    ]
    const labels = names.map((n) => n.replace(/\.eth$/, ''))
    const expiries = async () =>
      Promise.all(labels.map(async (l) => (await v2State(l)).expiry))
    const before = await expiries()
    await syncBrowserToChain(page)

    await waitForBignameBlock()
    await page.goto(`${MANAGER_APP_URL}/dashboard`)
    await expect(
      page.getByRole('button', { name: /^Select all names$/ }),
    ).toBeVisible({
      timeout: 60_000,
    })
    const search = page.getByPlaceholder('Search my names')
    await search.fill(tag)
    await expect(search).toHaveValue(tag)
    for (const name of names)
      await page
        .getByRole('button', { name: `Select ${name}`, exact: true })
        .click()
    await page.getByRole('button', { name: 'Renew', exact: true }).click()
    const dialog = page.getByRole('dialog')
    await dialog.getByRole('button', { name: 'Next', exact: true }).click()
    await dialog.getByRole('button', { name: /USDC/ }).first().click()
    await dialog.getByRole('button', { name: 'Confirm', exact: true }).click()

    // Authorize until exactly one name has renewed, then refuse the next send.
    const renewedCount = async () =>
      (await expiries()).filter((e, i) => e !== before[i]).length
    const pending = () =>
      wallet.getPendingRequestCount(Web3RequestKind.SendTransaction)
    while ((await renewedCount()) < 1) {
      await expect.poll(pending, { timeout: 120_000 }).toBeGreaterThanOrEqual(1)
      await wallet.authorize(Web3RequestKind.SendTransaction)
      // Wait for that send to land or for the next one to be asked.
      await expect
        .poll(async () => (await renewedCount()) >= 1 || pending() >= 1, {
          timeout: 60_000,
        })
        .toBe(true)
    }
    // The headless wallet drops the 4001 code, so the app retries a refusal
    // as transient (up to 3 times): refuse every attempt until it gives up.
    const failed = dialog.getByText('Renewal failed')
    for (
      let attempt = 0;
      attempt < 8 && !(await failed.isVisible());
      attempt++
    ) {
      await expect
        .poll(async () => (await failed.isVisible()) || pending() >= 1, {
          timeout: 60_000,
        })
        .toBe(true)
      if (pending() >= 1) await wallet.reject(Web3RequestKind.SendTransaction)
    }
    await expect(failed).toBeVisible({ timeout: 60_000 })
    const failureText = await dialog.innerText()
    console.log(
      `[B9] failure step: ${failureText.replace(/\s+/g, ' ').slice(0, 300)}`,
    )

    const afterFailure = await expiries()
    const renewed = labels.filter((_, i) => afterFailure[i] !== before[i])
    expect(renewed.length, 'exactly the name before the refusal renewed').toBe(
      1,
    )

    // Retry: it resumes from the refused name and does not pay for the first again.
    let done = false
    const authorizing = authorizeTransactionsWhile(page, wallet, () => done)
    await dialog.getByRole('button', { name: 'Try again' }).click()
    await expect(page.getByText('Renewal Complete')).toBeVisible({
      timeout: 120_000,
    })
    done = true
    await authorizing

    const final = await expiries()
    for (const [i, label] of labels.entries()) {
      const moved = final[i] - before[i]
      expect(
        moved,
        `${label} renewed once — one calendar year, not two`,
      ).toBeGreaterThanOrEqual(365n * BigInt(DAY))
      expect(moved).toBeLessThanOrEqual(366n * BigInt(DAY))
    }
  })
})

test.describe('Temporary premium on registration (A24)', () => {
  test.describe.configure({ timeout: 600_000 })

  test("the cooldown banner's live fee is the oracle's premium, and it says when the fee reaches $0", {
    tag: ['@scenario:A24'],
  }, async ({ migrationConnectedPage: page, makeV2Name }) => {
    // 28 days of grace + 5 days into the 21-day premium window.
    const name = await makeV2Name({
      label: 'a24-premium',
      duration: -(28 + 5) * DAY,
    })
    const label = name.replace(/\.eth$/, '')
    const expiry = (await v2State(label)).expiry
    await syncBrowserToChain(page)
    await page.goto(`${MANAGER_APP_URL}/register/${name}`)
    await expect(page.getByText('This name is in price cooldown')).toBeVisible({
      timeout: 60_000,
    })

    // The page computes the live fee itself (lib/premiumDecay); the oracle
    // computes it on chain. Two independent computations of one curve.
    const oraclePremium = async () => {
      const [, premium] = await publicClient.readContract({
        address: ETH_REGISTRAR,
        abi: REGISTER_PRICE_ABI_A24,
        functionName: 'getRegisterPrice',
        args: [
          label,
          BigInt(365 * DAY),
          ensL1Contracts[supportedL1Chains.sepolia].usdc.address as Address,
        ],
      })
      return Number(premium) / 1e6
    }
    const shownFee = page
      .getByText(/Fee at this moment|Additional fee/)
      .first()
      .locator('xpath=..')
      .locator('[aria-label^="$"]')
      .first()
    const shown = async () =>
      Number(
        ((await shownFee.getAttribute('aria-label')) ?? '').replace(
          /[$,]/g,
          '',
        ),
      )
    const chain = await oraclePremium()
    console.log(`[A24] oracle premium $${chain.toFixed(2)}`)
    expect(chain, 'precondition: the name is in premium').toBeGreaterThan(0)
    await expect
      .poll(async () => Math.abs((await shown()) - chain) / chain, {
        timeout: 20_000,
        message: 'the live fee matches the oracle premium (within 1%)',
      })
      .toBeLessThan(0.01)

    // Zero at the end of the premium window: expiry + 28-day grace + 21 days.
    const zeroAt = new Date(Number(expiry + BigInt((28 + 21) * DAY)) * 1000)
    const zeroText = await page.evaluate(
      (ms) =>
        new Date(ms).toLocaleDateString('en-US', {
          month: 'long',
          day: 'numeric',
          year: 'numeric',
        }),
      zeroAt.getTime(),
    )
    await page
      .getByRole('button', { name: /How it works/ })
      .first()
      .click()
    await expect(
      page
        .getByText(/The fee hits \$0 on/)
        .first()
        .locator('xpath=..'),
      'the banner names the day the fee ends',
    ).toContainText(zeroText.replace(/,? \d{4}$/, ''))
  })
})
