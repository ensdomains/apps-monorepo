import { namehash, parseAbi } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import {
  createMakeV1Name,
  V1_ENS_REGISTRY,
} from '../../../fixtures/makeV1Name.js'
import {
  expect,
  MANAGER_APP_URL,
  PORTAL_APP_URL,
  test,
} from '../../../fixtures/playwright.cross-app.fixture.js'
import { publicClient } from '../../../helpers/anvil-client.js'
import {
  bignameName,
  waitForBignameBlock,
} from '../../../helpers/bigname-sync.js'
import { expectRecordsResolve } from '../../../helpers/resolve-records.js'
import { driveTransactionsToSuccess } from '../../../helpers/transaction-modal.js'

for (const type of ['unwrapped', 'wrapped'] as const) {
  test(`REG-03 ${type} V1 root creates two generations and resolves grandchild records in both apps`, async ({
    explorer,
    manager,
    accounts,
  }) => {
    test.setTimeout(180_000)
    const root = await createMakeV1Name({
      userAccount: privateKeyToAccount(accounts.getPrivateKey('user')),
    })({ label: `parity-grandchild-${type}`, type })
    const rootOwner = () =>
      publicClient.readContract({
        address: V1_ENS_REGISTRY,
        abi: parseAbi(['function owner(bytes32) view returns (address)']),
        functionName: 'owner',
        args: [namehash(root)],
      })
    const before = await rootOwner()
    let parent = root
    for (const label of ['child', 'grandchild']) {
      await explorer.page.goto(`${PORTAL_APP_URL}/${parent}/create-subname`)
      await explorer.page.locator('#label').fill(label)
      await explorer.page
        .getByRole('button', { name: 'Create subname', exact: true })
        .click()
      await driveTransactionsToSuccess(explorer.page, explorer.wallet, [
        'tx-create-ens-subname',
      ])
      await waitForBignameBlock()
      parent = `${label}.${parent}`
    }
    const description = `two generations ${type} ${Date.now()}`
    await explorer.page.goto(`${PORTAL_APP_URL}/${parent}/edit-records`)
    await explorer.page.getByLabel('Type', { exact: true }).selectOption('text')
    await explorer.page.getByLabel('Key', { exact: true }).fill('description')
    await explorer.page.getByLabel('Value', { exact: true }).fill(description)
    await explorer.page.getByRole('button', { name: 'Add record' }).click()
    await explorer.page.getByRole('button', { name: 'Save 1 change' }).click()
    await driveTransactionsToSuccess(explorer.page, explorer.wallet, [
      'tx-save-resolver-records',
    ])
    await expectRecordsResolve(parent, {
      texts: [{ key: 'description', value: description }],
    })
    await waitForBignameBlock()
    await explorer.page.goto(`${PORTAL_APP_URL}/${parent}/records`)
    await expect(
      explorer.page.getByText(description, { exact: true }),
    ).toBeVisible()
    await manager.page.goto(`${MANAGER_APP_URL}/${parent}`)
    await expect(
      manager.page.getByText(description, { exact: true }),
    ).toBeVisible()
    expect(await rootOwner()).toBe(before)
    expect((await bignameName(root))?.authority).toBe('ens_v1')
  })
}
