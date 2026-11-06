import { privateKeyToAccount } from 'viem/accounts'
import { createMakeV1Name } from '../../../fixtures/makeV1Name.js'
import {
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
import { splitController } from '../../../fixtures/v1-tails.js'
import { waitForBignameBlock } from '../../../helpers/bigname-sync.js'
import { assertV2Registered } from '../../../helpers/migration-assertions.js'
import {
  openMigrationFlow,
  selectOnlyRoots,
  upgradeCountingPrompts,
} from '../../../helpers/migration-flow.js'
import {
  saveProfileChanges,
  waitForProfileUpdated,
} from '../../../helpers/profile-helpers.js'
import { expectRecordsResolve } from '../../../helpers/resolve-records.js'
import { assertRoleBitmap } from '../../../helpers/role-assertions.js'
import { driveTransactionsToSuccess } from '../../../helpers/transaction-modal.js'
import { serveV1Names } from '../../../helpers/v1-names.js'

test('REG-02 retained V1 manager recovers record editing through Explorer resolver replacement', async ({
  explorer,
  manager,
  accounts,
}) => {
  test.setTimeout(300_000)
  await overrideManagerFeatureFlags(manager.page, {
    ...PROFILE_FEATURE_FLAGS,
    ...MIGRATION_FEATURE_FLAGS,
  })
  await manager.page.reload()
  await waitForManagerFeatureFlagOverride(manager.page)
  const owner = privateKeyToAccount(accounts.getPrivateKey('user'))
  const controller = accounts.getAddress('user2')
  // A fresh empty profile deliberately limits this recovery test: preserving
  // existing records while replacing a resolver needs a separate case.
  const name = await createMakeV1Name({ userAccount: owner })({
    label: 'parity-retained-manager',
    type: 'unwrapped',
    records: {},
  })
  const label = name.replace(/\.eth$/, '')
  await splitController(name, owner, controller)
  await serveV1Names(manager.page, {
    ownerAddress: owner.address,
    roots: [
      {
        kind: 'registration',
        label,
        ownerAddress: controller,
        registrantAddress: owner.address,
      },
    ],
  })
  await openMigrationFlow(manager.page)
  await selectOnlyRoots(manager.page, [name])
  const keepManager = manager.page.getByRole('checkbox', {
    name: /^Keep .* as a manager/,
  })
  await keepManager.locator('xpath=..').click()
  await expect(keepManager).toBeChecked()
  await upgradeCountingPrompts(manager.page, manager.wallet)
  await assertV2Registered(label)
  await assertRoleBitmap({ label }, controller, ['ROLE_SET_RESOLVER'])
  await waitForBignameBlock()

  await asAccount(manager, accounts, 'user2')
  await manager.page.goto(`${MANAGER_APP_URL}/${name}`)
  await expect(
    manager.page.getByRole('heading', { name, exact: true }),
  ).toBeVisible()
  await expect(
    manager.page.getByRole('button', { name: 'Edit Profile', exact: true }),
  ).toHaveCount(0)

  await asAccount(explorer, accounts, 'user2')
  await explorer.page.goto(`${PORTAL_APP_URL}/${name}/change-resolver`)
  const deploy = explorer.page.getByRole('switch', {
    name: 'Deploy new permissioned resolver',
  })
  await expect(async () => {
    if ((await deploy.getAttribute('data-state')) !== 'checked')
      await deploy.click()
    await expect(deploy).toHaveAttribute('data-state', 'checked', {
      timeout: 2_000,
    })
  }).toPass({ timeout: 15_000 })
  await explorer.page
    .getByRole('button', { name: 'Save changes', exact: true })
    .click()
  await driveTransactionsToSuccess(explorer.page, explorer.wallet, [
    'tx-deploy-permissioned-resolver',
    'tx-change-resolver',
  ])
  await waitForBignameBlock()

  await manager.page.goto(`${MANAGER_APP_URL}/${name}`)
  await manager.page
    .getByRole('button', { name: 'Edit Profile', exact: true })
    .click()
  const description = `retained manager recovery ${Date.now()}`
  await manager.page.getByPlaceholder('Description').fill(description)
  await saveProfileChanges(manager.page, manager.wallet)
  await waitForProfileUpdated(manager.page)
  await expectRecordsResolve(name, {
    texts: [{ key: 'description', value: description }],
  })
  await waitForBignameBlock()
  await explorer.page.goto(`${PORTAL_APP_URL}/${name}/records`)
  await expect(
    explorer.page.getByText(description, { exact: true }),
  ).toBeVisible()
  await assertRoleBitmap({ label }, controller, ['ROLE_SET_RESOLVER'])
})
