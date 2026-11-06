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
import { setV1RecordsOn } from '../../../fixtures/v1-records.js'
import { publicClient } from '../../../helpers/anvil-client.js'
import { waitForBignameBlock } from '../../../helpers/bigname-sync.js'
import { readPrimaryName } from '../../../helpers/primary-name.js'
import { driveTransactionsToSuccess } from '../../../helpers/transaction-modal.js'

for (const type of ['unwrapped', 'wrapped'] as const) {
  const id = type === 'unwrapped' ? 'L272' : 'L273'
  test(`${id} V1 primary name disappears when the forward ETH record changes`, async ({
    manager,
    explorer,
    accounts,
  }) => {
    test.setTimeout(180_000)
    const account = privateKeyToAccount(accounts.getPrivateKey('user'))
    const name = await createMakeV1Name({ userAccount: account })({
      label: id.toLowerCase(),
      type,
      records: { addresses: [{ coinType: 60, value: account.address }] },
    })
    await waitForBignameBlock()
    await explorer.page.goto(
      `${PORTAL_APP_URL}/addr/${account.address}/reverse-resolution`,
    )
    const row = explorer.page
      .getByRole('row')
      .filter({ has: explorer.page.getByText('Mainnet', { exact: true }) })
    await row.getByRole('button', { name: 'More', exact: true }).click()
    const sheet = explorer.page.getByRole('dialog', {
      name: 'Mainnet resolution',
    })
    await sheet.locator('input[name="name"]').fill(name)
    await sheet.getByRole('button', { name: 'Update', exact: true }).click()
    await driveTransactionsToSuccess(explorer.page, explorer.wallet, [
      'tx-update-reverse-name',
    ])
    await expect.poll(() => readPrimaryName(account.address)).toBe(name)
    await manager.page.goto(`${MANAGER_APP_URL}/${account.address}`)
    const profile = manager.page.getByRole('link', { name: /View profile/i })
    await expect(profile).toHaveAttribute('href', `/${name}`)
    await setV1RecordsOn(name, account, type === 'wrapped', {
      addresses: [{ coinType: 60, value: accounts.getAddress('user2') }],
    })
    const resolver = await publicClient.readContract({
      address: V1_ENS_REGISTRY,
      abi: parseAbi(['function resolver(bytes32) view returns (address)']),
      functionName: 'resolver',
      args: [namehash(name)],
    })
    expect(
      (
        await publicClient.readContract({
          address: resolver,
          abi: parseAbi(['function addr(bytes32) view returns (address)']),
          functionName: 'addr',
          args: [namehash(name)],
        })
      ).toLowerCase(),
    ).toBe(accounts.getAddress('user2').toLowerCase())
    await expect.poll(() => readPrimaryName(account.address)).toBeNull()
    await waitForBignameBlock()
    await manager.page.reload()
    await manager.page.waitForLoadState('networkidle')
    await expect(manager.page.locator('main')).toContainText(/Names/i)
    await expect(profile).toHaveCount(0)
  })
}
