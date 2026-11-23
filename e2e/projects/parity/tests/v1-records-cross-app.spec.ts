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
import { waitForBignameBlock } from '../../../helpers/bigname-sync.js'
import { driveTransactionsToSuccess } from '../../../helpers/transaction-modal.js'

for (const type of ['unwrapped', 'wrapped'] as const) {
  test(`REG-04 ${type} V1 record edit in Explorer is visible in Manager without migration`, async ({
    explorer,
    manager,
    accounts,
  }) => {
    test.setTimeout(180_000)
    const name = await createMakeV1Name({
      userAccount: privateKeyToAccount(accounts.getPrivateKey('user')),
    })({
      label: `parity-record-${type}`,
      type,
      records: {
        texts: [{ key: 'description', value: 'original parity description' }],
      },
    })
    const node = namehash(name)
    const registryAbi = parseAbi([
      'function owner(bytes32 node) view returns (address)',
      'function resolver(bytes32 node) view returns (address)',
    ])
    const before = await publicClient.readContract({
      address: V1_ENS_REGISTRY,
      abi: registryAbi,
      functionName: 'owner',
      args: [node],
    })
    const resolver = await publicClient.readContract({
      address: V1_ENS_REGISTRY,
      abi: registryAbi,
      functionName: 'resolver',
      args: [node],
    })
    await manager.page.goto(`${MANAGER_APP_URL}/${name}`)
    await expect(
      manager.page.getByText('original parity description', { exact: true }),
    ).toBeVisible()
    // Existing v1 editing is currently offered by Explorer. Record that
    // product restriction explicitly; do not turn this into Manager parity.
    await expect(
      manager.page.getByRole('button', { name: 'Edit Profile', exact: true }),
    ).toHaveCount(0)
    const { page, wallet } = explorer
    await page.goto(`${PORTAL_APP_URL}/${name}/edit-records`)
    await page.getByLabel('Type', { exact: true }).selectOption('text')
    await page.getByLabel('Key', { exact: true }).fill('description')
    const description = `updated ${type} parity ${Date.now()}`
    await page.getByLabel('Value', { exact: true }).fill(description)
    await page.getByRole('button', { name: 'Add record' }).click()
    await page.getByRole('button', { name: 'Save 1 change' }).click()
    await driveTransactionsToSuccess(page, wallet, ['tx-save-resolver-records'])
    expect(
      await publicClient.readContract({
        address: resolver,
        abi: parseAbi([
          'function text(bytes32 node, string key) view returns (string)',
        ]),
        functionName: 'text',
        args: [node, 'description'],
      }),
    ).toBe(description)
    expect(
      await publicClient.readContract({
        address: V1_ENS_REGISTRY,
        abi: registryAbi,
        functionName: 'owner',
        args: [node],
      }),
    ).toBe(before)
    await waitForBignameBlock()
    await manager.page.goto(`${MANAGER_APP_URL}/${name}`)
    await expect(
      manager.page.getByText(description, { exact: true }),
    ).toBeVisible()
    await page.goto(`${PORTAL_APP_URL}/${name}/records`)
    await expect(page.getByText(description, { exact: true })).toBeVisible()
  })
}
