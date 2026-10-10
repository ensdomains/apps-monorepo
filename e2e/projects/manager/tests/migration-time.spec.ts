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
import type { Page } from '@playwright/test'
import { type Address, parseAbi } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import {
  type GraceV1Name,
  makeGraceV1Name,
  PREMIGRATION_BONUS_PERIOD,
  syncBrowserToChain,
} from '../../../fixtures/makeGraceV1Name.js'
import { createMakeV1Name } from '../../../fixtures/makeV1Name.js'
import {
  authorizeTransactionsWhile,
  expect,
  test,
} from '../../../fixtures/playwright.manager.fixture.js'
import { publicClient, testClient } from '../../../helpers/anvil-client.js'
import {
  assertUnlockedMigration,
  assertV2Reserved,
} from '../../../helpers/migration-assertions.js'
import type { MockV1Name } from '../../../helpers/mock-v1-subgraph.js'
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
])
const REGISTRY_ABI = parseAbi([
  'struct State { uint8 status; uint64 expiry; address latestOwner; uint256 tokenId; uint256 resource; }',
  'function getState(uint256 anyId) view returns (State state)',
])
const RENEWER_ABI = parseAbi([
  'function isRenewable(string label) view returns (bool)',
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
    const control$ = nameCheckbox(page, control)
    if (await control$.isChecked()) await control$.locator('xpath=..').click()
    await expect(control$).not.toBeChecked()
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
