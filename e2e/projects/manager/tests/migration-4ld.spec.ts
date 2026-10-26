import { parseAbi } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { makeV1FourLD, type V1FourLD } from '../../../fixtures/makeV1FourLD.js'
import {
  createMakeV1Name,
  V1_ENS_REGISTRY,
} from '../../../fixtures/makeV1Name.js'
import { expect, test } from '../../../fixtures/playwright.manager.fixture.js'
import { publicClient, walletClient } from '../../../helpers/anvil-client.js'
import {
  isRealBigname,
  waitForBignameName,
  waitForBignameNames,
} from '../../../helpers/bigname-sync.js'
import {
  assertCopyRegistered,
  assertUserRegistryAttached,
  assertWrappedChildMigrated,
  readV2NameStatus,
} from '../../../helpers/migration-assertions.js'
import {
  anyRow,
  nestedRow,
  openMigrationFlow,
  rootRow,
  runMigrationFlow,
  selectOnlyRoots,
} from '../../../helpers/migration-flow.js'
import { expectRecordsResolve } from '../../../helpers/resolve-records.js'
import { readChainTruth, readRecords } from '../../../matrix/chain.js'

const records = { texts: [{ key: 'com.twitter', value: 'fourld-migration' }] }
const visibleTree = (tree: V1FourLD) =>
  waitForBignameNames(tree.levels.map((level) => level.name))

test.beforeEach(() =>
  test.skip(!isRealBigname, 'V1 4LD trees require real bigname'),
)

test('orphan registry 4LD is not offered without its ancestors', {
  tag: ['@scenario:Q1'],
}, async ({ migrationConnectedPage: page, accounts }) => {
  const tree = await makeV1FourLD(
    {
      twoLd: 'unwrapped',
      threeLd: 'registry',
      fourLd: 'registry',
      owners: { twoLd: 'user2', threeLd: 'user2' },
    },
    accounts,
  )
  const control = await createMakeV1Name({
    userAccount: privateKeyToAccount(accounts.getPrivateKey('user')),
  })({ label: 'q1-control', type: 'unwrapped' })
  await visibleTree(tree)
  await waitForBignameNames([control])
  const before = await readChainTruth(tree.name)
  await openMigrationFlow(page)
  await expect(rootRow(page, control)).toBeVisible({ timeout: 60_000 })
  await expect(anyRow(page, tree.name)).toHaveCount(0)
  expect(await readChainTruth(tree.name)).toEqual(before)
  expect(await readV2NameStatus(tree.name)).not.toBe(2)
})

test('copies a mixed registry 4LD and unlocked 3LD with linked registries and records', {
  tag: ['@scenario:Q2'],
}, async ({ migrationConnectedPage: page, wallet, accounts }) => {
  const tree = await makeV1FourLD(
    { twoLd: 'unwrapped', threeLd: 'unlocked', fourLd: 'registry', records },
    accounts,
  )
  await visibleTree(tree)
  await expectRecordsResolve(tree.name, records)
  await openMigrationFlow(page)
  await expect(nestedRow(page, tree.name)).toBeVisible({ timeout: 60_000 })
  await runMigrationFlow(page, wallet, { roots: [tree.twoLd.name] })
  await assertUserRegistryAttached(tree.twoLd.name)
  await assertCopyRegistered(tree.threeLd.name, tree.threeLd.owner)
  await assertUserRegistryAttached(tree.threeLd.name)
  await assertCopyRegistered(tree.name, tree.fourLd.owner)
  await expectRecordsResolve(tree.name, records)
})

test('an emancipated 4LD migrates independently of another owners locked ancestors', {
  tag: ['@scenario:Q3'],
}, async ({ migrationConnectedPage: page, wallet, accounts }) => {
  const tree = await makeV1FourLD(
    {
      twoLd: 'locked',
      threeLd: 'locked',
      fourLd: 'emancipated',
      owners: { twoLd: 'user2', threeLd: 'user2' },
      records,
    },
    accounts,
  )
  await visibleTree(tree)
  await openMigrationFlow(page)
  await expect(rootRow(page, tree.name)).toBeVisible({ timeout: 60_000 })
  await selectOnlyRoots(page, [tree.name])
  const before = await readChainTruth(tree.name)
  // Either outcome the scenario allows: the leaf migrates alone, or planning
  // says which prerequisite is missing. Only the generic retry is E2E-040.
  const upgrade = page.getByRole('button', {
    name: 'Upgrade 1 name',
    exact: true,
  })
  const explained = page.getByText(
    "Some subnames can't upgrade until their parent name is upgraded.",
    { exact: false },
  )
  const generic = page.getByText("Couldn't prepare your upgrade.", {
    exact: false,
  })
  await expect
    .poll(
      async () =>
        (await upgrade.isEnabled().catch(() => false)) ||
        (await explained.isVisible()) ||
        (await generic.isVisible()),
      { timeout: 90_000, message: 'planning settles' },
    )
    .toBe(true)
  await expect(
    generic,
    'E2E-040: a generic retry gives the owner no way forward',
  ).toHaveCount(0)
  const outcome = (await explained.isVisible()) ? 'explained' : 'migrates'
  console.log(`[Q3] outcome: ${outcome}`)
  if (outcome === 'explained') {
    // #1433: the unmet ancestor is named before anything is sent.
    await expect(upgrade).toBeDisabled()
    expect(await readChainTruth(tree.name)).toEqual(before)
    await expectRecordsResolve(tree.name, records)
    return
  }
  await runMigrationFlow(page, wallet, { roots: [tree.name] })
  await assertWrappedChildMigrated(tree.name, tree.fourLd.owner, {
    locked: false,
  })
  expect((await readChainTruth(tree.threeLd.name)).wrapperOwner).toBe(
    tree.threeLd.wrapperOwner,
  )
  await expectRecordsResolve(tree.name, records)
})

test('an unlocked 4LD keeps resolving when its locked ancestors migrate', {
  tag: ['@scenario:Q4'],
}, async ({ migrationConnectedPage: page, wallet, accounts }) => {
  const tree = await makeV1FourLD(
    { twoLd: 'locked', threeLd: 'locked', fourLd: 'unlocked', records },
    accounts,
  )
  await visibleTree(tree)
  await expectRecordsResolve(tree.name, records)
  await openMigrationFlow(page)
  await expect(rootRow(page, tree.twoLd.name)).toBeVisible({ timeout: 60_000 })
  await expect(nestedRow(page, tree.threeLd.name)).toBeVisible()
  // E2E-031's oracle: before the owner confirms, the left-behind 4LD is shown
  // as not upgradable, with the warning that it will stop resolving. Today it
  // is silently absent, and migrating the ancestors then loses resolution
  // (measured: UR text empty, V1 storage and holder intact — see E2E-031).
  test.fail(
    true,
    'E2E-031: the 4LD left behind by its locked ancestors is not shown, and stops resolving after they migrate',
  )
  await expect(
    page.getByText(tree.name, { exact: false }).first(),
    'the 4LD is listed as not upgradable',
  ).toBeVisible({ timeout: 30_000 })
  await expect(page.getByText(/stop resolving/i).first()).toBeVisible()
  await runMigrationFlow(page, wallet, { roots: [tree.twoLd.name] })
  await assertWrappedChildMigrated(tree.threeLd.name, tree.threeLd.owner, {
    locked: true,
  })
  expect((await readChainTruth(tree.name)).wrapperOwner).toBe(
    tree.fourLd.wrapperOwner,
  )
  expect(
    (await readRecords(tree.name, ['com.twitter'], [])).texts['com.twitter'],
  ).toBe('fourld-migration')
})

test('CANNOT_TRANSFER excludes the 4LD while its locked ancestors migrate', {
  tag: ['@scenario:Q5'],
}, async ({ migrationConnectedPage: page, wallet, accounts }) => {
  const tree = await makeV1FourLD(
    {
      twoLd: 'locked',
      threeLd: 'locked',
      fourLd: { type: 'locked', extraFuses: 4 },
    },
    accounts,
  )
  await visibleTree(tree)
  await openMigrationFlow(page)
  await expect(rootRow(page, tree.twoLd.name)).toBeVisible({ timeout: 60_000 })
  // The subtree has rendered, so the 4LD's absence is not a loading gap.
  await expect(nestedRow(page, tree.threeLd.name)).toBeVisible()
  await expect(anyRow(page, tree.name)).toHaveCount(0)
  await runMigrationFlow(page, wallet, { roots: [tree.twoLd.name] })
  await assertWrappedChildMigrated(tree.threeLd.name, tree.threeLd.owner, {
    locked: true,
  })
  const after = await readChainTruth(tree.name)
  expect(after.wrapperOwner).toBe(tree.fourLd.wrapperOwner)
  expect(after.fuses & 4).toBe(4)
})

test('selection treats the 4LD as a passenger of its 2LD', {
  tag: ['@scenario:Q6'],
}, async ({ migrationConnectedPage: page, accounts }) => {
  const tree = await makeV1FourLD(
    { twoLd: 'unwrapped', threeLd: 'registry', fourLd: 'registry' },
    accounts,
  )
  await visibleTree(tree)
  await openMigrationFlow(page)
  await expect(nestedRow(page, tree.name)).toBeVisible({ timeout: 60_000 })
  await expect(rootRow(page, tree.name)).toHaveCount(0)
  await selectOnlyRoots(page, [tree.twoLd.name])
  await expect(
    page.getByRole('button', { name: 'Upgrade 3 names', exact: true }),
  ).toBeVisible()
  expect(await readV2NameStatus(tree.name)).not.toBe(2)
})

test('a 4LD can still upgrade after its ancestors upgraded in an earlier session', {
  tag: ['@scenario:Q8'],
}, async ({ migrationConnectedPage: page, wallet, accounts }) => {
  const tree = await makeV1FourLD(
    {
      twoLd: 'unwrapped',
      threeLd: 'registry',
      fourLd: 'registry',
      owners: { fourLd: 'user2' },
      records,
    },
    accounts,
  )
  await visibleTree(tree)
  await openMigrationFlow(page)
  await expect(rootRow(page, tree.twoLd.name)).toBeVisible({ timeout: 60_000 })
  await expect(nestedRow(page, tree.threeLd.name)).toBeVisible()
  await expect(anyRow(page, tree.name)).toHaveCount(0)
  await runMigrationFlow(page, wallet, { roots: [tree.twoLd.name] })
  await assertCopyRegistered(tree.threeLd.name, tree.threeLd.owner)
  // The leaf was held out of the first batch by another owner. Bring it
  // back to the same wallet that now owns both V2 ancestors, so this probes
  // the prior migration rather than an unrelated parent-permission refusal.
  const owner = accounts.getAddress('user')
  const hash = await walletClient.writeContract({
    account: privateKeyToAccount(accounts.getPrivateKey('user2')),
    address: V1_ENS_REGISTRY,
    abi: parseAbi(['function setOwner(bytes32 node,address owner)']),
    functionName: 'setOwner',
    args: [tree.node, owner],
  })
  expect((await publicClient.waitForTransactionReceipt({ hash })).status).toBe(
    'success',
  )
  expect((await readChainTruth(tree.name)).controller.toLowerCase()).toBe(
    owner.toLowerCase(),
  )
  await waitForBignameName(
    tree.name,
    (name) => name.owner?.toLowerCase() === owner.toLowerCase(),
  )
  const control = await createMakeV1Name({
    userAccount: privateKeyToAccount(accounts.getPrivateKey('user')),
  })({ label: 'q8-control', type: 'unwrapped' })
  await waitForBignameNames([control])
  expect(
    (await readRecords(tree.name, ['com.twitter'], [])).texts['com.twitter'],
  ).toBe('fourld-migration')
  // Reload discards the previous upgrade session's cached classification.
  await page.reload()
  await openMigrationFlow(page)
  await expect(rootRow(page, control)).toBeVisible({ timeout: 60_000 })
  expect(await readV2NameStatus(tree.name)).not.toBe(2)
  // Either outcome the scenario allows: the leaf is offered and upgrades
  // under its V2 ancestors, or it is shown with a reason. Silence is E2E-041.
  test.fail(
    true,
    'E2E-041: an existing V2 ancestor path strands a later V1 4LD copy',
  )
  await expect(
    rootRow(page, tree.name).or(page.getByText(tree.name).first()),
    'the leaf is offered, or listed with a reason',
  ).toBeVisible({ timeout: 60_000 })
  if (!(await rootRow(page, tree.name).isVisible())) return
  await runMigrationFlow(page, wallet, { roots: [tree.name] })
  await assertCopyRegistered(tree.name, owner)
  await expectRecordsResolve(tree.name, records)
})
