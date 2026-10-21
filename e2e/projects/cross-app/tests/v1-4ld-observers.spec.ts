import { makeV1FourLD } from '../../../fixtures/makeV1FourLD.js'
import {
  type AppSession,
  asAccount,
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
import {
  isRealBigname,
  waitForBignameBlock,
  waitForBignameName,
  waitForBignameNames,
} from '../../../helpers/bigname-sync.js'
import {
  assertCopyRegistered,
  assertUserRegistryAttached,
} from '../../../helpers/migration-assertions.js'
import {
  nestedRow,
  openMigrationFlow,
  rootRow,
  runMigrationFlow,
} from '../../../helpers/migration-flow.js'
import type { PortalAccounts } from '../../../helpers/portal-auth.js'
import {
  openPrimaryNamePicker,
  readPrimaryName,
} from '../../../helpers/primary-name.js'
import {
  saveProfileChanges,
  waitForProfileUpdated,
} from '../../../helpers/profile-helpers.js'
import { expectRecordsResolve } from '../../../helpers/resolve-records.js'
import {
  driveTransactionsToSuccess,
  transferTxId,
} from '../../../helpers/transaction-modal.js'
import { readAddressRows, readRecordRows } from '../../../matrix/assert.js'
import { readChainTruth } from '../../../matrix/chain.js'

test.describe.configure({ timeout: 300_000 })
test.beforeEach(async ({ manager }) => {
  test.skip(!isRealBigname, 'V1 4LD observers require real bigname')
  await overrideManagerFeatureFlags(manager.page, {
    ...PROFILE_FEATURE_FLAGS,
    ...MIGRATION_FEATURE_FLAGS,
  })
  await manager.page.reload()
  await waitForManagerFeatureFlagOverride(manager.page)
})

test('V1 4LD records edit in explorer resolves and manager requires upgrade', {
  tag: ['@scenario:Q14'],
}, async ({ explorer, manager, accounts }) => {
  const tree = await makeV1FourLD(
    {
      twoLd: 'unwrapped',
      threeLd: 'registry',
      fourLd: 'registry',
      records: { texts: [{ key: 'url', value: 'https://fourld.test' }] },
    },
    accounts,
  )
  await waitForBignameNames(tree.levels.map((level) => level.name))
  const description = `4LD description ${tree.name}`
  const { page, wallet } = explorer
  await page.goto(`${PORTAL_APP_URL}/${tree.name}/edit-records`)
  await page.getByLabel('Type', { exact: true }).selectOption('text')
  await page.getByLabel('Key', { exact: true }).fill('description')
  await page.getByLabel('Value', { exact: true }).fill(description)
  await page.getByRole('button', { name: 'Add record' }).click()
  await page.getByRole('button', { name: 'Save 1 change' }).click()
  await driveTransactionsToSuccess(page, wallet, ['tx-save-resolver-records'])
  await expectRecordsResolve(tree.name, {
    texts: [{ key: 'description', value: description }],
  })
  await waitForBignameBlock()
  await manager.page.goto(`${MANAGER_APP_URL}/${tree.name}`)
  await expect(
    manager.page.getByText(description, { exact: true }),
  ).toBeVisible()
  const edit = manager.page.getByRole('button', {
    name: 'Edit Profile',
    exact: true,
  })
  await expect(edit).toHaveAttribute('aria-disabled', 'true')
  await edit.hover()
  await expect(
    manager.page.getByText('Upgrade name to edit profile', { exact: true }),
  ).toBeVisible()
})

test('migrated 4LD can be edited in both apps and has a five-row registry path', {
  tag: ['@scenario:Q7'],
}, async ({ explorer, manager, accounts }) => {
  const records = { texts: [{ key: 'description', value: 'Before migration' }] }
  const tree = await makeV1FourLD(
    { twoLd: 'unwrapped', threeLd: 'registry', fourLd: 'registry', records },
    accounts,
  )
  await waitForBignameNames(tree.levels.map((level) => level.name))
  await runMigrationFlow(manager.page, manager.wallet, {
    roots: [tree.twoLd.name],
  })
  await assertUserRegistryAttached(tree.twoLd.name)
  await assertUserRegistryAttached(tree.threeLd.name)
  await assertCopyRegistered(tree.name, tree.fourLd.owner)
  await expectRecordsResolve(tree.name, records)
  await waitForBignameName(tree.name, (n) => n.authority === 'ens_v2')
  await manager.page.goto(`${MANAGER_APP_URL}/${tree.name}`)
  await manager.page.getByRole('button', { name: 'Edit Profile' }).click()
  await manager.page.getByPlaceholder('Description').fill('Edited migrated 4LD')
  await saveProfileChanges(manager.page, manager.wallet)
  await waitForProfileUpdated(manager.page)
  await expectRecordsResolve(tree.name, {
    texts: [{ key: 'description', value: 'Edited migrated 4LD' }],
  })
  await waitForBignameBlock()
  await explorer.page.goto(`${PORTAL_APP_URL}/${tree.name}/edit-records`)
  await explorer.page.getByLabel('Type', { exact: true }).selectOption('text')
  await explorer.page.getByLabel('Key', { exact: true }).fill('com.twitter')
  await explorer.page.getByLabel('Value', { exact: true }).fill('fourld-edited')
  await explorer.page.getByRole('button', { name: 'Add record' }).click()
  await explorer.page.getByRole('button', { name: 'Save 1 change' }).click()
  await driveTransactionsToSuccess(explorer.page, explorer.wallet, [
    'tx-save-resolver-records',
  ])
  await expectRecordsResolve(tree.name, {
    texts: [{ key: 'com.twitter', value: 'fourld-edited' }],
  })
  await explorer.page.goto(`${PORTAL_APP_URL}/${tree.name}/registry`)
  await expect(
    explorer.page.locator('main [style*="padding-left"]'),
  ).toHaveCount(5)
})

async function assertTransferredDashboards(
  wrapped: boolean,
  {
    explorer,
    manager,
    accounts,
  }: {
    explorer: AppSession
    manager: AppSession
    accounts: PortalAccounts
  },
) {
  const tree = await makeV1FourLD(
    {
      twoLd: wrapped ? 'wrapped' : 'unwrapped',
      threeLd: wrapped ? 'unlocked' : 'registry',
      fourLd: wrapped ? 'unlocked' : 'registry',
      owners: { twoLd: 'user2', threeLd: 'user2' },
    },
    accounts,
  )
  await waitForBignameNames(tree.levels.map((level) => level.name))
  await explorer.page.goto(`${PORTAL_APP_URL}/${tree.name}/ownership/transfer`)
  await explorer.page
    .getByPlaceholder('ENS name or address')
    .fill(accounts.getAddress('user2'))
  await explorer.page
    .getByRole('button', { name: 'Transfer name', exact: true })
    .click()
  await driveTransactionsToSuccess(explorer.page, explorer.wallet, [
    transferTxId(
      tree.name,
      wrapped ? 'transfer-erc1155' : 'set-registry-owner',
    ),
  ])
  const truth = await readChainTruth(tree.name)
  expect((truth.wrapperOwner ?? truth.controller).toLowerCase()).toBe(
    accounts.getAddress('user2').toLowerCase(),
  )
  await waitForBignameName(
    tree.name,
    (n) =>
      n.owner?.toLowerCase() === accounts.getAddress('user2').toLowerCase(),
  )
  await manager.page.goto(`${MANAGER_APP_URL}/dashboard`)
  await expect(
    manager.page.getByRole('button', {
      name: 'Select all names',
      exact: true,
    }),
  ).toBeVisible()
  await expect(
    manager.page.getByRole('button', {
      name: `More options for ${tree.name}`,
      exact: true,
    }),
  ).toHaveCount(0)
  await manager.page.getByPlaceholder('Search my names').fill(tree.name)
  await expect(
    manager.page.getByText('No names to display', { exact: true }),
  ).toBeVisible()
  await asAccount(manager, accounts, 'user2')
  const welcome = manager.page.getByRole('dialog', {
    name: 'Welcome to the new ENS app!',
  })
  if (await welcome.isVisible())
    await welcome.getByRole('button', { name: 'Close', exact: true }).click()
  await expect(
    manager.page.getByRole('button', {
      name: 'Select all names',
      exact: true,
    }),
  ).toBeVisible()
  await manager.page.getByPlaceholder('Search my names').fill(tree.name)
  await expect(
    manager.page.getByRole('button', {
      name: `More options for ${tree.name}`,
      exact: true,
    }),
  ).toBeVisible()
  await openMigrationFlow(manager.page)
  await expect(rootRow(manager.page, tree.twoLd.name)).toBeVisible()
  await expect(nestedRow(manager.page, tree.name)).toBeVisible()
}

test('transferred registry 4LD follows its owner in both manager dashboards', {
  tag: ['@scenario:Q16'],
}, async ({ explorer, manager, accounts }) => {
  await assertTransferredDashboards(false, { explorer, manager, accounts })
})

test('transferred wrapped 4LD follows its owner in both manager dashboards', {
  tag: ['@scenario:Q16'],
}, async ({ explorer, manager, accounts }) => {
  await assertTransferredDashboards(true, { explorer, manager, accounts })
})

test('manager primary picker excludes a V1 4LD despite an owned forward record', {
  tag: ['@scenario:Q18'],
}, async ({ manager, accounts, makeV2Name }) => {
  const tree = await makeV1FourLD(
    {
      twoLd: 'unwrapped',
      threeLd: 'registry',
      fourLd: 'registry',
      records: {
        addresses: [{ coinType: 60, value: accounts.getAddress('user') }],
      },
    },
    accounts,
  )
  await waitForBignameNames(tree.levels.map((level) => level.name))
  const control = await makeV2Name({ label: 'q18-control' })
  const picker = await openPrimaryNamePicker(
    manager.page,
    accounts.getAddress('user'),
  )
  await picker.getByPlaceholder('Search names').fill(control)
  await expect(
    picker.getByRole('button', {
      name: `Select ${control} as primary name`,
      exact: true,
    }),
  ).toBeVisible()
  await picker.getByPlaceholder('Search names').fill(tree.name)
  await expect(
    picker.getByText('No names found', { exact: true }),
  ).toBeVisible()
  await expect(
    picker.getByRole('button', {
      name: `Select ${tree.name} as primary name`,
      exact: true,
    }),
  ).toHaveCount(0)
  await expectRecordsResolve(tree.name, {
    addresses: [{ coinType: 60, value: accounts.getAddress('user') }],
  })
})

test('explorer sets a V1 4LD primary name that survives migration', {
  tag: ['@scenario:Q17', '@scenario:Q19'],
}, async ({ explorer, manager, accounts }) => {
  const owner = accounts.getAddress('user')
  const records = { addresses: [{ coinType: 60, value: owner }] }
  const tree = await makeV1FourLD(
    { twoLd: 'unwrapped', threeLd: 'registry', fourLd: 'registry', records },
    accounts,
  )
  await waitForBignameNames(tree.levels.map((level) => level.name))
  await expectRecordsResolve(tree.name, records)
  await explorer.page.goto(`${PORTAL_APP_URL}/${tree.name}/address`)
  await explorer.page
    .getByRole('row')
    .filter({ hasText: 'Mainnet' })
    .getByRole('button', { name: 'More', exact: true })
    .click()
  await explorer.page
    .getByRole('button', { name: 'Set primary name', exact: true })
    .click()
  await driveTransactionsToSuccess(explorer.page, explorer.wallet, [
    'tx-forward-set-primary-name',
  ])
  await expect
    .poll(() => readPrimaryName(owner), { timeout: 60_000 })
    .toBe(tree.name)
  await manager.page.goto(`${MANAGER_APP_URL}/dashboard`)
  await expect(
    manager.page.getByText(tree.name, { exact: true }).first(),
  ).toBeVisible()
  await runMigrationFlow(manager.page, manager.wallet, {
    roots: [tree.twoLd.name],
  })
  await assertCopyRegistered(tree.name, owner)
  await expectRecordsResolve(tree.name, records)
  await expect
    .poll(() => readPrimaryName(owner), { timeout: 60_000 })
    .toBe(tree.name)
})

// Q24's finite sweep: list membership, displayed ownership and records, and
// the record/transfer actions after copying the mixed Q2 tree.
test('mixed 4LD copy exposes truthful state and executable record and transfer actions', {
  tag: [
    '@scenario:Q24',
    '@inv:INV3-4ld-state',
    '@inv:INV4-4ld-state',
    '@inv:INV5-4ld-copy-actions',
  ],
}, async ({ explorer, manager, accounts }) => {
  const records = { texts: [{ key: 'com.twitter', value: 'q24-before' }] }
  const tree = await makeV1FourLD(
    { twoLd: 'unwrapped', threeLd: 'unlocked', fourLd: 'registry', records },
    accounts,
  )
  await waitForBignameNames(tree.levels.map((level) => level.name))
  await runMigrationFlow(manager.page, manager.wallet, {
    roots: [tree.twoLd.name],
  })
  await assertCopyRegistered(tree.name, tree.fourLd.owner)
  await expectRecordsResolve(tree.name, records)
  await waitForBignameName(tree.name, (name) => name.authority === 'ens_v2')
  await manager.page.goto(`${MANAGER_APP_URL}/dashboard`)
  await manager.page.getByPlaceholder('Search my names').fill(tree.name)
  await expect(
    manager.page.getByRole('button', {
      name: `More options for ${tree.name}`,
      exact: true,
    }),
  ).toBeVisible()
  await explorer.page.goto(`${PORTAL_APP_URL}/${tree.name}/ownership`)
  await expect
    .poll(() => readAddressRows(explorer.page))
    .toContainEqual({ label: 'Owner', address: tree.fourLd.owner })
  await explorer.page.goto(`${PORTAL_APP_URL}/${tree.name}/records`)
  await expect
    .poll(() => readRecordRows(explorer.page))
    .toMatchObject({ 'com.twitter': 'q24-before' })
  await explorer.page.goto(`${PORTAL_APP_URL}/${tree.name}/edit-records`)
  await explorer.page.getByLabel('Type', { exact: true }).selectOption('text')
  await explorer.page.getByLabel('Key', { exact: true }).fill('description')
  await explorer.page.getByLabel('Value', { exact: true }).fill('q24-after')
  await explorer.page.getByRole('button', { name: 'Add record' }).click()
  await explorer.page.getByRole('button', { name: 'Save 1 change' }).click()
  await driveTransactionsToSuccess(explorer.page, explorer.wallet, [
    'tx-save-resolver-records',
  ])
  const updated = {
    texts: [...records.texts, { key: 'description', value: 'q24-after' }],
  }
  await expectRecordsResolve(tree.name, updated)
  await explorer.page.goto(`${PORTAL_APP_URL}/${tree.name}/ownership/transfer`)
  await explorer.page
    .getByPlaceholder('ENS name or address')
    .fill(accounts.getAddress('user2'))
  await explorer.page.locator('#transfer-option-detachResolver').uncheck()
  const detachRegistry = explorer.page.locator(
    '#transfer-option-detachRegistry',
  )
  if (await detachRegistry.isVisible()) await detachRegistry.uncheck()
  await explorer.page
    .getByRole('button', { name: 'Transfer name', exact: true })
    .click()
  await driveTransactionsToSuccess(explorer.page, explorer.wallet, [
    transferTxId(tree.name, 'transfer-token-unsafe'),
  ])
  await assertCopyRegistered(tree.name, accounts.getAddress('user2'))
  await expectRecordsResolve(tree.name, updated)
})

// Q9's post-transfer state: the sender no longer owns either the leaf or
// its immediate parent. Refusals must name the reason and leave chain state intact.
test('transferred wrapped 4LD refuses the former owners write surfaces', {
  tag: ['@scenario:Q24', '@inv:INV5-4ld-transfer-actions'],
}, async ({ explorer, accounts }) => {
  const records = { texts: [{ key: 'com.twitter', value: 'q24-transfer' }] }
  const tree = await makeV1FourLD(
    {
      twoLd: 'wrapped',
      threeLd: 'unlocked',
      fourLd: 'unlocked',
      owners: { twoLd: 'user2', threeLd: 'user2' },
      records,
    },
    accounts,
  )
  await waitForBignameNames(tree.levels.map((level) => level.name))
  const { page, wallet } = explorer
  await page.goto(`${PORTAL_APP_URL}/${tree.name}/ownership/transfer`)
  await page
    .getByPlaceholder('ENS name or address')
    .fill(accounts.getAddress('user2'))
  await page.locator('#transfer-option-detachResolver').uncheck()
  await page.getByRole('button', { name: 'Transfer name', exact: true }).click()
  await driveTransactionsToSuccess(page, wallet, [
    transferTxId(tree.name, 'transfer-erc1155'),
  ])
  const after = await readChainTruth(tree.name)
  expect(after.wrapperOwner?.toLowerCase()).toBe(
    accounts.getAddress('user2').toLowerCase(),
  )
  await expectRecordsResolve(tree.name, records)
  await page.goto(`${PORTAL_APP_URL}/${tree.name}/ownership/transfer`)
  await expect(
    page.getByText(
      `Only the current owner, or the owner of ${tree.threeLd.name}, can move it.`,
    ),
  ).toBeVisible()
  await expect(page.getByPlaceholder('ENS name or address')).toHaveCount(0)
  await page.goto(`${PORTAL_APP_URL}/${tree.name}/edit-records`)
  await expect(
    page.getByText('Permission Denied', { exact: true }),
  ).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Add record', exact: true }),
  ).toHaveCount(0)
  await page.goto(`${PORTAL_APP_URL}/${tree.name}/change-resolver`)
  await expect(
    page.getByText('Permission Denied', { exact: true }),
  ).toBeVisible()
  await expect(page.locator('#resolver-address')).toHaveCount(0)
  await page.goto(`${PORTAL_APP_URL}/${tree.name}/fuses/burn`)
  await expect(
    page.getByText('You are not the owner of this name.'),
  ).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Save changes', exact: true }),
  ).toHaveCount(0)
  await page.goto(`${PORTAL_APP_URL}/${tree.name}/create-subname`)
  // V1 names can create subnames since #1396, so this is now the holder gate.
  await expect(
    page.getByText('Only its owner can create subnames', { exact: true }),
  ).toBeVisible()
  await page.goto(`${PORTAL_APP_URL}/${tree.name}/roles`)
  await expect(
    page.getByText('Only 2LD and 3LD .eth names are supported', {
      exact: true,
    }),
  ).toBeVisible()
  expect(await readChainTruth(tree.name)).toEqual(after)
  await expectRecordsResolve(tree.name, records)
})
