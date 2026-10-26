/**
 * The explorer on names #1494 recreates, after the merges into its branch:
 *
 * - #1506: a V2 name on a resolver other than PublicResolverV2 is asked, by a
 *   dry-run of the record write, whether the wallet may edit. A recreated
 *   child keeps its V1 PublicResolver, so its holder can edit there.
 * - #1496: editing is refused with a reason when the resolver will not take
 *   the wallet. The fuse lock only applies to locked wrapped names; a
 *   recreated child can still repoint its resolver, so it gets the plain
 *   denial.
 * - b0480bcc8: the legacy-registry resolver fallback runs only for names with
 *   no V2 owner. A recreated child whose V2 resolver was cleared must not show
 *   its stale V1 records.
 * - #1502: a V1 name whose V2 reservation lapsed but whose V1 grace has not
 *   keeps its records and its editor through that fallback.
 *
 * The recreated state comes from the manager's real `/upgrade` flow
 * (`recreateTree`), so the explorer reads what the product writes. Oracles
 * are chain reads.
 */
import type { Page } from '@playwright/test'
import {
  type Address,
  encodeFunctionData,
  namehash,
  parseAbi,
  zeroAddress,
} from 'viem'
import { makeGraceV1Name } from '../../../fixtures/makeGraceV1Name.js'
import {
  createMakeV1Name,
  V1_PUBLIC_RESOLVER,
} from '../../../fixtures/makeV1Name.js'
import {
  connectWithHeadlessWallet,
  expect,
  test,
} from '../../../fixtures/playwright.portal.fixture.js'
import { setV1RecordsOn } from '../../../fixtures/v1-records.js'
import { publicClient, testClient } from '../../../helpers/anvil-client.js'
import {
  assertCopyResolver,
  assertUserRegistryAttached,
  readGraveyard,
} from '../../../helpers/migration-assertions.js'
import { createBignameMock } from '../../../helpers/mock-bigname.js'
import {
  asPlainEoas,
  recreateTree,
  registryChild,
  send,
} from '../../../helpers/recreation.js'
import { dnsEncode } from '../../../helpers/resolve-records.js'
import { driveTransactionsToSuccess } from '../../../helpers/transaction-modal.js'
import {
  ethRegistryState,
  labelId,
  V2_ETH_REGISTRY,
} from '../../../helpers/v2-reads.js'

const PORTAL_APP_URL = process.env.PORTAL_APP_URL ?? 'http://localhost:3001'
const SAVE_RECORDS_TX = 'tx-save-resolver-records'

const V1_RESOLVER_ABI = parseAbi([
  'function text(bytes32 node, string key) view returns (string)',
])
const readV1Text = (resolver: Address, name: string, key: string) =>
  publicClient.readContract({
    address: resolver,
    abi: V1_RESOLVER_ABI,
    functionName: 'text',
    args: [namehash(name), key],
  })

/** Leave the manager's V1 index routes behind; the explorer gets a plain catch-all. */
async function resetIndexRoutes(page: Page) {
  await page.unrouteAll({ behavior: 'ignoreErrors' })
  await createBignameMock().install(page)
}

/**
 * The Records page can render "No records set" first (server render, or the
 * UniversalResolver read) and only then fall back to another resolver on the
 * client. Settle before asserting, or an early empty frame passes vacuously.
 */
async function settledRecords(page: Page, name: string) {
  await page.goto(`${PORTAL_APP_URL}/${name}/records`)
  await expect(
    page.getByText('No records set').or(page.getByRole('table')),
  ).toBeVisible({ timeout: 60_000 })
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(10_000)
}

async function addTextRecord(page: Page, key: string, value: string) {
  await page.getByLabel('Type', { exact: true }).selectOption('text')
  await page.getByLabel('Key', { exact: true }).fill(key)
  await page.getByLabel('Value', { exact: true }).fill(value)
  await page.getByRole('button', { name: 'Add record' }).click()
}

const denied = (page: Page) =>
  page.getByText(/don't have permission to edit records/i)
const lockedTitle = (page: Page) => page.getByText('Records cannot be edited')
const editorControls = (page: Page) =>
  page.getByRole('button', { name: 'Add record' })

test.describe('#1494 explorer on recreated subnames (#1506, #1496, b0480bcc8)', () => {
  test.describe.configure({ timeout: 600_000 })
  test.use({ mockBignameEnabled: true })

  test('the V1 holder edits on the retained resolver, a stranger cannot, and Graveyard.clear turns it into a plain denial (#1506, #1496)', async ({
    page,
    wallet,
    wallets,
  }) => {
    const owner = wallets.account('owner')
    const bob = wallets.account('manager')
    await asPlainEoas(bob)

    const parent = await createMakeV1Name({ userAccount: owner })({
      label: 'xpl-recr',
    })
    const bobName = await registryChild({
      parent,
      label: 'bob',
      parentOwner: owner,
      holder: bob,
      records: { texts: [{ key: 'description', value: 'bob on v1' }] },
    })

    await recreateTree({
      page,
      wallet,
      owner,
      parent,
      children: [bobName],
    })
    await assertUserRegistryAttached(parent)
    await assertCopyResolver(bobName, V1_PUBLIC_RESOLVER)

    await resetIndexRoutes(page)
    await page.goto(PORTAL_APP_URL)
    // The provider stays authorised from the manager step on this page.
    const connect = page.getByRole('button', { name: /^Connect( wallet)?$/ })
    if (await connect.isVisible({ timeout: 10_000 }).catch(() => false))
      await connectWithHeadlessWallet(page, wallet)

    // ── #1506: the V1 holder can edit on the kept V1 resolver ──
    await wallets.switchTo('manager')
    await page.goto(`${PORTAL_APP_URL}/${bobName}/records`)
    await expect(page.getByText('bob on v1').first()).toBeVisible({
      timeout: 60_000,
    })
    await page.goto(`${PORTAL_APP_URL}/${bobName}/edit-records`)
    await expect(editorControls(page)).toBeVisible({ timeout: 60_000 })
    await addTextRecord(page, 'url', 'https://bob.example')
    await page.getByRole('button', { name: /^Save 1 change/ }).click()
    await driveTransactionsToSuccess(page, wallet, [SAVE_RECORDS_TX])
    expect(
      await readV1Text(V1_PUBLIC_RESOLVER, bobName, 'url'),
      'the write landed on the retained V1 resolver',
    ).toBe('https://bob.example')

    // ── #1506 negative: a stranger is refused up front ──
    await wallets.switchTo('stranger')
    await page.goto(`${PORTAL_APP_URL}/${bobName}/edit-records`)
    await expect(denied(page)).toBeVisible({ timeout: 60_000 })
    await expect(editorControls(page)).toHaveCount(0)

    // ── Graveyard.clear: V1 no longer authorises bob; he gets the plain denial ──
    const graveyard = await readGraveyard()
    await send(
      owner,
      graveyard,
      encodeFunctionData({
        abi: parseAbi(['function clear(bytes[] names)']),
        functionName: 'clear',
        args: [[dnsEncode(bobName)]],
      }),
      `Graveyard.clear(${bobName})`,
    )
    await wallets.switchTo('manager')
    await page.goto(`${PORTAL_APP_URL}/${bobName}/edit-records`)
    await expect(denied(page)).toBeVisible({ timeout: 60_000 })
    await expect(lockedTitle(page)).toHaveCount(0)
    await expect(editorControls(page)).toHaveCount(0)
    // Reads are unaffected: the V2 pointer still names the V1 resolver.
    await page.goto(`${PORTAL_APP_URL}/${bobName}/records`)
    await expect(page.getByText('bob on v1').first()).toBeVisible({
      timeout: 60_000,
    })
  })

  /**
   * b0480bcc8 gated the legacy-registry fallback in `getNameResolverAddress`
   * (the edit page), but `getProfile` (the Records page) has its own fallback
   * from #1502 without that gate. With a resolver anywhere above it the walk
   * answers and nothing falls back (stage 1). With none (stage 2) the Records
   * page falls back to the V1 registry and shows zoe's stale V1 record:
   * FAILS on b0480bcc8 — see the test plan's findings.
   */
  test('a recreated child with no V2 resolver shows no stale V1 records (b0480bcc8)', async ({
    page,
    wallet,
    wallets,
  }) => {
    const owner = wallets.account('owner')
    const bob = wallets.account('manager')
    await asPlainEoas(bob)
    const parent = await createMakeV1Name({ userAccount: owner })({
      label: 'xpl-stale',
    })
    const zoeName = await registryChild({
      parent,
      label: 'zoe',
      parentOwner: owner,
      holder: bob,
      records: { texts: [{ key: 'description', value: 'zoe stale v1' }] },
    })

    await recreateTree({ page, wallet, owner, parent, children: [zoeName] })
    const registry = await assertUserRegistryAttached(parent)
    await resetIndexRoutes(page)
    await page.goto(PORTAL_APP_URL)
    const connect = page.getByRole('button', { name: /^Connect( wallet)?$/ })
    if (await connect.isVisible({ timeout: 10_000 }).catch(() => false))
      await connectWithHeadlessWallet(page, wallet)

    // Stage 1: only zoe's own V2 resolver is cleared; the parent's answers.
    await send(
      bob,
      registry,
      encodeFunctionData({
        abi: parseAbi([
          'function setResolver(uint256 anyId, address resolver)',
        ]),
        functionName: 'setResolver',
        args: [labelId('zoe'), zeroAddress],
      }),
      'zoe setResolver(0)',
    )
    await assertCopyResolver(zoeName, zeroAddress)
    expect(
      await readV1Text(V1_PUBLIC_RESOLVER, zoeName, 'description'),
      'the stale V1 record still exists on chain',
    ).toBe('zoe stale v1')
    await settledRecords(page, zoeName)
    await expect(page.getByText('zoe stale v1')).toHaveCount(0)
    await expect(page.getByText('No records set')).toBeVisible()

    // Stage 2: the parent's owner clears the parent's resolver too, so the
    // walk finds no resolver at all and the fallback condition is reached.
    await send(
      owner,
      V2_ETH_REGISTRY,
      encodeFunctionData({
        abi: parseAbi([
          'function setResolver(uint256 anyId, address resolver)',
        ]),
        functionName: 'setResolver',
        args: [labelId(parent.replace(/\.eth$/, '')), zeroAddress],
      }),
      'parent setResolver(0)',
    )
    await settledRecords(page, zoeName)
    await expect(
      page.getByText('zoe stale v1'),
      'the Records page must not fall back to the V1 registry for a V2 name',
    ).toHaveCount(0)
    await expect(page.getByText('No records set')).toBeVisible()
  })

  test('a V1 name whose V2 reservation lapsed in V1 grace keeps its records and its editor (#1502)', async ({
    page,
    wallet,
    wallets,
  }) => {
    const owner = wallets.account('owner')
    const grace = await makeGraceV1Name({
      label: 'xpl-gap',
      owner,
      reservationBonus: 1n,
    })
    await testClient.increaseTime({ seconds: 5 })
    await testClient.mine({ blocks: 1 })
    expect(
      (await ethRegistryState(grace.label)).status,
      'the V2 reservation has lapsed (AVAILABLE)',
    ).toBe(0)
    await setV1RecordsOn(grace.name, owner, false, {
      texts: [{ key: 'description', value: 'in the grace gap' }],
    })

    await page.goto(PORTAL_APP_URL)
    await connectWithHeadlessWallet(page, wallet)
    await page.goto(`${PORTAL_APP_URL}/${grace.name}/records`)
    await expect(page.getByText('in the grace gap').first()).toBeVisible({
      timeout: 60_000,
    })
    await page.goto(`${PORTAL_APP_URL}/${grace.name}/edit-records`)
    await expect(editorControls(page)).toBeVisible({ timeout: 60_000 })
  })
})
