import { labelhash, namehash, parseAbi } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import {
  createMakeV1Name,
  V1_BASE_REGISTRAR,
  V1_ENS_REGISTRY,
} from '../../../fixtures/makeV1Name.js'
import {
  connectWithHeadlessWallet,
  expect,
  test,
} from '../../../fixtures/playwright.portal.fixture.js'
import { publicClient, walletClient } from '../../../helpers/anvil-client.js'
import { waitForBignameBlock } from '../../../helpers/bigname-sync.js'
import { driveTransactionsToSuccess } from '../../../helpers/transaction-modal.js'

for (const split of [false, true]) {
  test(`${split ? 'L090' : 'L086'} V1 reclaim manager ${split ? 'restores split manager to owner' : 'is hidden when roles already match'}`, async ({
    portalPage: page,
    wallet,
    accounts,
  }) => {
    test.setTimeout(120_000)
    const account = privateKeyToAccount(accounts.getPrivateKey('user'))
    const name = await createMakeV1Name({ userAccount: account })({
      label: split ? 'l090' : 'l086',
      type: 'unwrapped',
      records: split
        ? undefined
        : {
            addresses: [
              {
                coinType: 61,
                value: '0x42D63ae25990889E35F215bC95884039Ba354115',
              },
            ],
          },
    })
    const manager = () =>
      publicClient.readContract({
        address: V1_ENS_REGISTRY,
        abi: parseAbi(['function owner(bytes32) view returns (address)']),
        functionName: 'owner',
        args: [namehash(name)],
      })
    if (split) {
      const hash = await walletClient.writeContract({
        account,
        address: V1_ENS_REGISTRY,
        abi: parseAbi(['function setOwner(bytes32,address)']),
        functionName: 'setOwner',
        args: [namehash(name), accounts.getAddress('user2')],
      })
      await publicClient.waitForTransactionReceipt({ hash })
      expect((await manager()).toLowerCase()).toBe(
        accounts.getAddress('user2').toLowerCase(),
      )
    }
    await waitForBignameBlock()
    await connectWithHeadlessWallet(page, wallet)
    await page.goto(`/${name}/ownership`)
    await expect(
      page.getByRole('link', { name: 'Transfer', exact: true }),
    ).toBeEnabled()
    const reclaim = page.getByRole('button', {
      name: /Reclaim manager$/,
    })
    if (split) {
      await reclaim.click()
      await driveTransactionsToSuccess(page, wallet, [
        `reclaim-manager-${name}`,
      ])
      await waitForBignameBlock()
      await page.reload()
    }
    for (const role of ['Owner', 'Manager']) {
      const row = page.getByText(role, { exact: true }).locator('xpath=../..')
      await expect(
        row.locator(`a[href*="${account.address}" i]`).first(),
      ).toBeVisible()
    }
    await expect(reclaim).toHaveCount(0)
    expect((await manager()).toLowerCase()).toBe(account.address.toLowerCase())
    const registrant = await publicClient.readContract({
      address: V1_BASE_REGISTRAR,
      abi: parseAbi(['function ownerOf(uint256) view returns (address)']),
      functionName: 'ownerOf',
      args: [BigInt(labelhash(name.split('.')[0]))],
    })
    expect(registrant.toLowerCase()).toBe(account.address.toLowerCase())
  })
}
