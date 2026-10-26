import { namehash, parseAbi, zeroAddress } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import {
  createMakeV1Name,
  V1_NAME_WRAPPER,
} from '../../../fixtures/makeV1Name.js'
import { makeV1Subname } from '../../../fixtures/makeV1Subname.js'
import {
  connectWithHeadlessWallet,
  expect,
  test,
} from '../../../fixtures/playwright.portal.fixture.js'
import { publicClient } from '../../../helpers/anvil-client.js'
import { waitForBignameBlock } from '../../../helpers/bigname-sync.js'
import { driveTransactionsToSuccess } from '../../../helpers/transaction-modal.js'
import { seedLegacyTree } from '../helpers/legacy-tree.js'

for (const id of ['L034', 'L035']) {
  test(`${id} recreate a wrapped child expired thirty days ago`, async ({
    portalPage: page,
    wallet,
    accounts,
  }, testInfo) => {
    test.setTimeout(120_000)
    const account = privateKeyToAccount(accounts.getPrivateKey('user'))
    const parent = await createMakeV1Name({ userAccount: account })({
      label: id.toLowerCase(),
      type: 'locked',
    })
    const name = await makeV1Subname({
      parentName: parent.replace(/\.eth$/, ''),
      childLabel: 'test',
      ownerAddress: account.address,
      parentOwnerAccount: account,
      fuses: 65536,
      expiryOffset: -30 * 86400,
    })
    const read = () =>
      publicClient.readContract({
        address: V1_NAME_WRAPPER,
        abi: parseAbi([
          'function getData(uint256) view returns (address,uint32,uint64)',
        ]),
        functionName: 'getData',
        args: [BigInt(namehash(name))],
      })
    expect((await read())[0]).toBe(zeroAddress)
    await waitForBignameBlock()
    await connectWithHeadlessWallet(page, wallet)
    await page.goto(`/${name}`)
    await expect(
      page.locator('main').getByRole('heading', { level: 1 }),
    ).toBeVisible()
    await testInfo.attach('expired-profile', {
      body: await page.locator('main').innerText(),
      contentType: 'text/plain',
    })
    // Both legacy entry points can use the parent's create flow when the child profile has no recreate action.
    await page.goto(`/${parent}/subnames`)
    await page
      .getByRole('link', { name: 'Create subname', exact: true })
      .click()
    await page.locator('#label').fill('test')
    await page
      .getByRole('button', { name: 'Create subname', exact: true })
      .click()
    await driveTransactionsToSuccess(page, wallet, ['tx-create-ens-subname'])
    const [holder, , expiry] = await read()
    expect(holder.toLowerCase()).toBe(account.address.toLowerCase())
    expect(expiry).toBeGreaterThan((await publicClient.getBlock()).timestamp)
    await waitForBignameBlock()
    await page.goto(`/${name}/ownership`)
    await expect(
      page.locator('main').locator(`a[href*="${account.address}" i]`).first(),
    ).toBeVisible()
  })
}

test('L037 preserve the referrer while creating a V1 wrapped child', async ({
  portalPage: page,
  wallet,
  accounts,
}) => {
  const parent = await createMakeV1Name({
    userAccount: privateKeyToAccount(accounts.getPrivateKey('user')),
  })({ label: 'l037', type: 'wrapped' })
  const referrer = '0x1234567890123456789012345678901234567890'
  await connectWithHeadlessWallet(page, wallet)
  await page.goto(`/${parent}/subnames?referrer=${referrer}`)
  await page.getByRole('link', { name: 'Create subname', exact: true }).click()
  await page.locator('#label').fill('test')
  await page
    .getByRole('button', { name: 'Create subname', exact: true })
    .click()
  await driveTransactionsToSuccess(page, wallet, ['tx-create-ens-subname'])
  await expect(page).toHaveURL(
    new RegExp(`/test\\.${parent.replaceAll('.', '\\.')}([/?]|$)`),
  )
  expect(new URL(page.url()).searchParams.get('referrer')).toBe(referrer)
})

test('L060 unwrapped child has no Extend action', async ({
  portalPage: page,
  wallet,
  accounts,
}) => {
  const { name } = await seedLegacyTree(
    { label: 'l060', type: 'legacy', subnames: [{ label: 'test' }] },
    'L060',
    accounts,
  )
  await waitForBignameBlock()
  await connectWithHeadlessWallet(page, wallet)
  await page.goto(`/${name}`)
  await expect(
    page.locator('main').getByRole('heading', { level: 1 }),
  ).toBeVisible()
  await expect(
    page.getByRole('link', { name: /^(Extend|Renew)$/ }),
  ).toHaveCount(0)
  await expect(
    page.getByRole('button', { name: /^(Extend|Renew)$/ }),
  ).toHaveCount(0)
})
