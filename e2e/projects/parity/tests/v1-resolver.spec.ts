import { namehash, parseAbi } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import {
  createMakeV1Name,
  V1_ENS_REGISTRY,
  V1_PUBLIC_RESOLVER,
} from '../../../fixtures/makeV1Name.js'
import { makeV1RegistrySubname } from '../../../fixtures/makeV1RegistrySubname.js'
import {
  connectWithHeadlessWallet,
  expect,
  test,
} from '../../../fixtures/playwright.portal.fixture.js'
import { publicClient } from '../../../helpers/anvil-client.js'
import { waitForBignameBlock } from '../../../helpers/bigname-sync.js'
import { driveTransactionsToSuccess } from '../../../helpers/transaction-modal.js'

test('L283 wrapped V1 rejects a malformed resolver address', async ({
  portalPage: page,
  wallet,
  accounts,
}) => {
  const name = await createMakeV1Name({
    userAccount: privateKeyToAccount(accounts.getPrivateKey('user')),
  })({ label: 'l283', type: 'wrapped' })
  const readResolver = () =>
    publicClient.readContract({
      address: V1_ENS_REGISTRY,
      abi: parseAbi(['function resolver(bytes32 node) view returns (address)']),
      functionName: 'resolver',
      args: [namehash(name)],
    })
  const before = await readResolver()
  await connectWithHeadlessWallet(page, wallet)
  await page.goto(`/${name}/change-resolver`)
  await page.locator('#resolver-address').fill('0xInvalid')
  await expect(
    page.getByRole('button', { name: 'Save changes', exact: true }),
  ).toBeDisabled()
  expect(await readResolver()).toBe(before)
})

test('L215 V1 child without resolver can recover via the Explorer resolver page', async ({
  portalPage: page,
  wallet,
  accounts,
}, testInfo) => {
  const account = privateKeyToAccount(accounts.getPrivateKey('user'))
  const parent = await createMakeV1Name({ userAccount: account })({
    label: 'l215',
    type: 'unwrapped',
  })
  const name = await makeV1RegistrySubname({
    parentName: parent.replace(/\.eth$/, ''),
    childLabel: 'test',
    parentOwnerAccount: account,
    ownerAddress: account.address,
  })
  const readResolver = () =>
    publicClient.readContract({
      address: V1_ENS_REGISTRY,
      abi: parseAbi(['function resolver(bytes32) view returns (address)']),
      functionName: 'resolver',
      args: [namehash(name)],
    })
  expect(await readResolver()).toBe(
    '0x0000000000000000000000000000000000000000',
  )
  await waitForBignameBlock()
  await connectWithHeadlessWallet(page, wallet)
  await page.goto(`/${name}/edit-records`)
  await expect(
    page
      .getByText('No resolver set', { exact: true })
      .or(page.getByText('Name not found', { exact: true })),
  ).toBeVisible()
  await testInfo.attach('missing-resolver-edit-state', {
    body: await page.locator('main').innerText(),
    contentType: 'text/plain',
  })
  // The legacy guided repair is replaced by a separate Resolver page.
  await page.goto(`/${name}/resolver`)
  await page.getByRole('link', { name: /Set resolver|Change resolver/ }).click()
  await page.locator('#resolver-address').fill(V1_PUBLIC_RESOLVER)
  await page.getByRole('button', { name: 'Save changes', exact: true }).click()
  await driveTransactionsToSuccess(page, wallet, ['tx-change-resolver'])
  expect((await readResolver()).toLowerCase()).toBe(
    V1_PUBLIC_RESOLVER.toLowerCase(),
  )
  await page.goto(`/${name}/edit-records`)
  await expect(page.getByLabel('Type', { exact: true })).toBeVisible()
})
