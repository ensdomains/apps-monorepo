import { namehash, parseAbi, zeroAddress } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import {
  createMakeV1Name,
  V1_ENS_REGISTRY,
  V1_NAME_WRAPPER,
} from '../../../fixtures/makeV1Name.js'
import { makeV1RegistrySubname } from '../../../fixtures/makeV1RegistrySubname.js'
import { makeV1Subname } from '../../../fixtures/makeV1Subname.js'
import {
  connectWithHeadlessWallet,
  expect,
  test,
} from '../../../fixtures/playwright.portal.fixture.js'
import { publicClient } from '../../../helpers/anvil-client.js'
import { waitForBignameBlock } from '../../../helpers/bigname-sync.js'
import { driveTransactionsToSuccess } from '../../../helpers/transaction-modal.js'

for (const shape of ['unwrapped', 'wrapped', 'emancipated'] as const) {
  for (const authority of ['parent-only', 'both', 'child-only'] as const) {
    const number =
      38 +
      ['unwrapped', 'wrapped', 'emancipated'].indexOf(shape) * 3 +
      ['parent-only', 'both', 'child-only'].indexOf(authority)
    const id = `L${String(number).padStart(3, '0')}`
    test(`${id} V1 ${shape} child deletion by ${authority}`, async ({
      portalPage: page,
      wallet,
      accounts,
    }) => {
      test.setTimeout(120_000)
      const parentAccount = privateKeyToAccount(
        accounts.getPrivateKey(authority === 'child-only' ? 'user2' : 'user'),
      )
      const childOwner = accounts.getAddress(
        authority === 'parent-only' ? 'user2' : 'user',
      )
      const parent = await createMakeV1Name({ userAccount: parentAccount })({
        label: id.toLowerCase(),
        type: shape === 'emancipated' ? 'locked' : shape,
      })
      const config = {
        parentName: parent.replace(/\.eth$/, ''),
        childLabel: 'delete-me',
        ownerAddress: childOwner,
        parentOwnerAccount: parentAccount,
      }
      const name =
        shape === 'unwrapped'
          ? await makeV1RegistrySubname(config)
          : await makeV1Subname({
              ...config,
              fuses: shape === 'emancipated' ? 65536 : 0,
            })
      const readOwner = async () =>
        shape === 'unwrapped'
          ? publicClient.readContract({
              address: V1_ENS_REGISTRY,
              abi: parseAbi(['function owner(bytes32) view returns (address)']),
              functionName: 'owner',
              args: [namehash(name)],
            })
          : (
              await publicClient.readContract({
                address: V1_NAME_WRAPPER,
                abi: parseAbi([
                  'function getData(uint256) view returns (address,uint32,uint64)',
                ]),
                functionName: 'getData',
                args: [BigInt(namehash(name))],
              })
            )[0]
      expect((await readOwner()).toLowerCase()).toBe(childOwner.toLowerCase())
      await waitForBignameBlock()
      await connectWithHeadlessWallet(page, wallet)
      // Explorer exposes deletion on the parent's Subnames table. Keep the
      // old ownership matrix and postcondition while adapting the entry point.
      await page.goto(`/${parent}/subnames`)
      const row = page
        .locator('table')
        .getByRole('row')
        .filter({ hasText: name })
      await expect(row).toBeVisible({ timeout: 30_000 })
      const remove = row.getByRole('button', {
        name: `Delete ${name}`,
        exact: true,
      })
      if (shape === 'emancipated' && authority === 'parent-only') {
        await expect(remove).toHaveCount(0)
        await expect(
          row.getByRole('button', { name: /only they can delete/ }),
        ).toBeVisible()
        expect((await readOwner()).toLowerCase()).toBe(childOwner.toLowerCase())
        return
      }
      // An absent control is a parity failure, not an expected failure: the
      // old manager allowed the child's holder to delete these shapes.
      await expect(remove).toBeVisible({ timeout: 10_000 })
      await remove.click()
      await page.getByRole('button', { name: 'Confirm', exact: true }).click()
      await driveTransactionsToSuccess(page, wallet, [
        `tx-delete-ens-subname-${name}`,
      ])
      expect((await readOwner()).toLowerCase()).toBe(zeroAddress)
      await expect(row).toHaveCount(0)
    })
  }
}

test('L047 expired emancipated V1 child has no parent deletion action', async ({
  portalPage: page,
  wallet,
  accounts,
}) => {
  const account = privateKeyToAccount(accounts.getPrivateKey('user'))
  const parent = await createMakeV1Name({ userAccount: account })({
    label: 'l047',
    type: 'locked',
  })
  const child = await makeV1Subname({
    parentName: parent.replace(/\.eth$/, ''),
    childLabel: 'day-expired',
    ownerAddress: account.address,
    parentOwnerAccount: account,
    fuses: 65536,
    expiryOffset: -86400,
  })
  await waitForBignameBlock()
  await connectWithHeadlessWallet(page, wallet)
  await page.goto(`/${parent}/subnames`)
  await expect(
    page.getByRole('heading', { name: /subnames/i }).first(),
  ).toBeVisible()
  await expect(
    page
      .locator('table')
      .or(page.getByText('No subnames yet', { exact: true }))
      .first(),
  ).toBeVisible()
  await expect(page.getByText('Loading subnames...')).toHaveCount(0)
  await expect(page.getByText('Failed to load subnames')).toHaveCount(0)
  await expect(
    page.getByRole('button', { name: `Delete ${child}`, exact: true }),
  ).toHaveCount(0)
  const [owner] = await publicClient.readContract({
    address: V1_NAME_WRAPPER,
    abi: parseAbi([
      'function getData(uint256) view returns (address,uint32,uint64)',
    ]),
    functionName: 'getData',
    args: [BigInt(namehash(child))],
  })
  expect(owner).toBe(zeroAddress)
})
