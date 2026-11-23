/**
 * V1 4LDs over time (Q20–Q23), observed in both apps. Permanently advances the
 * shared chain clock, so it runs only in `cross-app-time`, after every other
 * cross-app test (`projects/cross-app/playwright.config.ts`).
 */
import { parseAbi } from 'viem'
import { makeV1FourLD } from '../../../fixtures/makeV1FourLD.js'
import { V1_NAME_WRAPPER } from '../../../fixtures/makeV1Name.js'
import {
  expect,
  MANAGER_APP_URL,
  PORTAL_APP_URL,
  test,
} from '../../../fixtures/playwright.cross-app.fixture.js'
import {
  MIGRATION_FEATURE_FLAGS,
  overrideManagerFeatureFlags,
  PROFILE_FEATURE_FLAGS,
  waitForManagerFeatureFlagOverride,
} from '../../../fixtures/playwright.manager.fixture.js'
import { createTime } from '../../../fixtures/time.js'
import { publicClient } from '../../../helpers/anvil-client.js'
import {
  isRealBigname,
  waitForBignameBlock,
  waitForBignameNames,
} from '../../../helpers/bigname-sync.js'
import { authorizeTransactionsWhile } from '../../../helpers/manager-auth.js'
import { assertCopyRegistered } from '../../../helpers/migration-assertions.js'
import {
  anyRow,
  openMigrationFlow,
  rootRow,
  runMigrationFlow,
} from '../../../helpers/migration-flow.js'
import { renewFor28Days } from '../../../helpers/profile-helpers.js'
import {
  expectRecordsResolve,
  resolveRecords,
} from '../../../helpers/resolve-records.js'
import { readChainTruth } from '../../../matrix/chain.js'

const DAY = 86400
const WRAPPER_ABI = parseAbi([
  'function setSubnodeOwner(bytes32 parentNode, string label, address owner, uint32 fuses, uint64 expiry) returns (bytes32)',
  'function safeTransferFrom(address from, address to, uint256 id, uint256 amount, bytes data)',
])
const records = { texts: [{ key: 'com.twitter', value: 'fourld-expiry' }] }
test.describe.configure({ timeout: 600_000 })
test.beforeEach(async ({ manager }) => {
  test.skip(!isRealBigname, 'V1 4LD observers require real bigname')
  await overrideManagerFeatureFlags(manager.page, {
    ...PROFILE_FEATURE_FLAGS,
    ...MIGRATION_FEATURE_FLAGS,
  })
  await manager.page.reload()
  await waitForManagerFeatureFlagOverride(manager.page)
})

test('2LD grace leaves the live wrapped 4LD reassignable by its parent, as on chain', {
  tag: ['@scenario:Q20'],
}, async ({ explorer, manager, accounts }) => {
  const tree = await makeV1FourLD(
    {
      twoLd: 'wrapped',
      threeLd: 'unlocked',
      fourLd: 'unlocked',
      duration: 28 * DAY,
      owners: { fourLd: 'user2' },
    },
    accounts,
  )
  expect(tree.fourLd.expiry).toBeLessThanOrEqual(tree.threeLd.expiry)
  expect(tree.threeLd.expiry).toBeLessThanOrEqual(tree.twoLd.expiry)
  const time = createTime({ page: explorer.page })
  await time.sync()
  await time.increaseTime({
    seconds:
      Number(
        tree.twoLd.ancestorExpiry - (await publicClient.getBlock()).timestamp,
      ) + DAY,
  })
  await createTime({ page: manager.page }).sync()
  await waitForBignameBlock()
  // What the chain allows during the 2LD's grace: the 3LD and 4LD are still
  // live in the NameWrapper (grace blocks only the IS_DOT_ETH 2LD itself).
  const leafLabel = tree.name.split('.')[0]
  await publicClient.simulateContract({
    account: tree.threeLd.owner,
    address: V1_NAME_WRAPPER,
    abi: WRAPPER_ABI,
    functionName: 'setSubnodeOwner',
    args: [tree.threeLd.node, leafLabel, tree.threeLd.owner, 0, 0n],
  })
  await publicClient.simulateContract({
    account: tree.fourLd.owner,
    address: V1_NAME_WRAPPER,
    abi: WRAPPER_ABI,
    functionName: 'safeTransferFrom',
    args: [tree.fourLd.owner, tree.threeLd.owner, BigInt(tree.node), 1n, '0x'],
  })
  expect((await readChainTruth(tree.name)).wrapperOwner).toBe(
    tree.fourLd.wrapperOwner,
  )
  // The explorer is connected as the 3LD owner, so it should offer the
  // parent's reassign path the chain allows.
  await explorer.page.goto(`${PORTAL_APP_URL}/${tree.name}/ownership/transfer`)
  await expect(
    explorer.page
      .getByText(/is in its grace period/)
      .or(explorer.page.getByPlaceholder('ENS name or address')),
  ).toBeVisible({ timeout: 30_000 })
  test.fail(
    true,
    'E2E-043: the explorer refuses the parent reassign of a live 4LD while only its 2LD is in grace',
  )
  await expect(
    explorer.page.getByPlaceholder('ENS name or address'),
  ).toBeVisible()
})

test('renewing the 2LD in grace lets its registry 4LD copy with the whole chain', {
  tag: ['@scenario:Q21'],
}, async ({ explorer, manager, accounts }) => {
  const tree = await makeV1FourLD(
    {
      twoLd: 'unwrapped',
      threeLd: 'registry',
      fourLd: 'registry',
      duration: 28 * DAY,
      records,
    },
    accounts,
  )
  const time = createTime({ page: manager.page })
  await time.sync()
  await time.increaseTime({
    seconds:
      Number(
        tree.twoLd.ancestorExpiry - (await publicClient.getBlock()).timestamp,
      ) + DAY,
  })
  await createTime({ page: explorer.page }).sync()
  await waitForBignameNames(tree.levels.map((level) => level.name))
  await manager.page.goto(`${MANAGER_APP_URL}/renew-v1/${tree.twoLd.name}`)
  await expect(
    manager.page.getByRole('button', { name: /pay with stablecoins/i }),
  ).toBeVisible()
  await manager.page.waitForLoadState('networkidle')
  let done = false
  const authorizing = authorizeTransactionsWhile(
    manager.page,
    manager.wallet,
    () => done,
  )
  let picked: string
  try {
    picked = await renewFor28Days(manager.page)
  } finally {
    done = true
    await authorizing
  }
  // The picker's minimum is a calendar date, so the lease moves 28 days or,
  // depending on the time of day, to the next midnight: check the date shown.
  const renewed = (await readChainTruth(tree.twoLd.name)).ancestorExpiry
  const moved = renewed - tree.twoLd.ancestorExpiry
  expect(moved).toBeGreaterThanOrEqual(28n * BigInt(DAY))
  expect(moved).toBeLessThanOrEqual(29n * BigInt(DAY))
  expect(
    new Date(Number(renewed) * 1000).toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    }),
    'the lease ends on the date the dialog showed',
  ).toBe(picked)
  await waitForBignameBlock()
  await runMigrationFlow(manager.page, manager.wallet, {
    roots: [tree.twoLd.name],
  })
  await assertCopyRegistered(tree.threeLd.name, tree.threeLd.owner)
  await assertCopyRegistered(tree.name, tree.fourLd.owner)
  await expectRecordsResolve(tree.name, records)
})

test('past 2LD grace the 4LD disappears from upgrade and stops resolving', {
  tag: ['@scenario:Q22'],
}, async ({ explorer, manager, accounts }) => {
  const tree = await makeV1FourLD(
    {
      twoLd: 'locked',
      threeLd: 'locked',
      fourLd: 'locked',
      duration: 28 * DAY,
      records,
    },
    accounts,
  )
  await expectRecordsResolve(tree.name, records)
  const time = createTime({ page: manager.page })
  await time.sync()
  await time.increaseTime({
    seconds:
      Number(
        tree.twoLd.ancestorExpiry - (await publicClient.getBlock()).timestamp,
      ) +
      91 * DAY,
  })
  await createTime({ page: explorer.page }).sync()
  // Seed the positive control only after advancing the clock.
  const control = await makeV1FourLD(
    { twoLd: 'unwrapped', threeLd: 'registry', fourLd: 'registry', records },
    accounts,
  )
  await expectRecordsResolve(control.name, records)
  await waitForBignameNames(control.levels.map((level) => level.name))
  await openMigrationFlow(manager.page)
  await expect(rootRow(manager.page, control.twoLd.name)).toBeVisible({
    timeout: 60_000,
  })
  await expect(anyRow(manager.page, tree.name)).toHaveCount(0)
  expect((await readChainTruth(tree.name)).wrapperOwner).toBeNull()
  const resolved = await resolveRecords(tree.name, records)
  expect(resolved.every((record) => record.got !== record.want)).toBe(true)
})

test('expired middle wrapper cannot be presented as an active 4LD owner', {
  tag: ['@scenario:Q23'],
}, async ({ explorer, manager, accounts }) => {
  const now = (await publicClient.getBlock()).timestamp
  const tree = await makeV1FourLD(
    {
      twoLd: 'locked',
      threeLd: { type: 'locked', expiry: now + 3600n },
      fourLd: 'locked',
      records,
    },
    accounts,
  )
  expect(tree.fourLd.expiry).toBe(tree.threeLd.expiry)
  const time = createTime({ page: explorer.page })
  await time.sync()
  await time.increaseTime({
    seconds:
      Number(tree.threeLd.expiry - (await publicClient.getBlock()).timestamp) +
      1,
  })
  await createTime({ page: manager.page }).sync()
  const truth = await readChainTruth(tree.name)
  expect(truth.ancestorExpiry).toBeGreaterThan(
    (await publicClient.getBlock()).timestamp,
  )
  expect(truth.wrapperOwner).toBeNull()
  await explorer.page.goto(`${PORTAL_APP_URL}/${tree.name}/ownership/transfer`)
  // The explorer reads the 3LD's own wrapper expiry here, not just the 2LD's.
  await expect(
    explorer.page.getByText('This subname has expired', { exact: true }),
  ).toBeVisible({ timeout: 30_000 })
  await expect(
    explorer.page.getByText(/Name Wrapper has cleared its owner/),
  ).toBeVisible()
  await expect(
    explorer.page.getByPlaceholder('ENS name or address'),
  ).toHaveCount(0)
})
