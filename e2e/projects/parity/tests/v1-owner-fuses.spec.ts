import { namehash, parseAbi } from 'viem'
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

for (const scenario of [
  {
    id: 'L190',
    initial: 0,
    mask: 125,
    fuses: [
      'Cannot Unwrap',
      'Cannot Create Subname',
      'Cannot Transfer',
      'Cannot Set Resolver',
      'Cannot Approve',
      'Cannot Set TTL',
    ],
  },
  {
    id: 'L195',
    initial: 65536,
    mask: 125,
    fuses: [
      'Cannot Unwrap',
      'Cannot Create Subname',
      'Cannot Transfer',
      'Cannot Set Resolver',
      'Cannot Approve',
      'Cannot Set TTL',
    ],
  },
  { id: 'L196', initial: 65537, mask: 2, fuses: ['Cannot Burn Fuses'] },
]) {
  test(`${scenario.id} V1 ${scenario.id === 'L190' ? 'root' : 'emancipated child'} owner burns ${scenario.fuses.join(', ')}`, async ({
    portalPage: page,
    wallet,
    accounts,
  }) => {
    test.setTimeout(120_000)
    const parentAccount = privateKeyToAccount(
      accounts.getPrivateKey(scenario.id === 'L190' ? 'user' : 'user2'),
    )
    const parent = await createMakeV1Name({ userAccount: parentAccount })({
      label: scenario.id.toLowerCase(),
      type: scenario.id === 'L190' ? 'wrapped' : 'locked',
    })
    const name =
      scenario.id === 'L190'
        ? parent
        : await makeV1Subname({
            parentName: parent.replace(/\.eth$/, ''),
            childLabel: 'test',
            ownerAddress: accounts.getAddress('user'),
            parentOwnerAccount: parentAccount,
            fuses: scenario.initial,
          })
    const readFuses = async () =>
      (
        await publicClient.readContract({
          address: V1_NAME_WRAPPER,
          abi: parseAbi([
            'function getData(uint256) view returns (address,uint32,uint64)',
          ]),
          functionName: 'getData',
          args: [BigInt(namehash(name))],
        })
      )[1]
    expect((await readFuses()) & scenario.mask).toBe(0)
    await waitForBignameBlock()
    await connectWithHeadlessWallet(page, wallet)
    if (scenario.id === 'L190') {
      for (const [route, label] of [
        ['subnames', 'Create subname'],
        ['ownership', 'Transfer'],
        ['resolver', 'Change resolver'],
      ]) {
        await page.goto(`/${name}/${route}`)
        await expect(
          page.getByRole('link', { name: new RegExp(`${label}$`) }),
        ).toBeVisible()
      }
    }
    await page.goto(`/${name}/fuses`)
    for (const fuse of scenario.fuses) {
      await expect(
        page
          .getByRole('row')
          .filter({ has: page.getByText(fuse, { exact: true }) }),
      ).toContainText('False')
    }
    await page.getByRole('link', { name: 'Burn fuses', exact: true }).click()
    for (const fuse of scenario.fuses) {
      await page
        .getByText(fuse, { exact: true })
        .locator('..')
        .getByRole('checkbox')
        .check()
    }
    await page
      .getByRole('button', { name: 'Save changes', exact: true })
      .click()
    await driveTransactionsToSuccess(page, wallet, ['tx-burn-fuses'])
    expect((await readFuses()) & scenario.mask).toBe(scenario.mask)
    await page.goto(`/${name}/fuses`)
    for (const fuse of scenario.fuses) {
      await expect(
        page
          .getByRole('row')
          .filter({ has: page.getByText(fuse, { exact: true }) }),
      ).toContainText('True')
    }
    // The new form may remain accessible, but already burnt permissions must not be writable.
    await page.goto(`/${name}/fuses/burn`)
    for (const fuse of scenario.fuses) {
      await expect(
        page
          .getByText(fuse, { exact: true })
          .locator('..')
          .getByRole('checkbox'),
      ).toBeDisabled()
    }
    await expect(
      page.getByRole('button', { name: 'Save changes', exact: true }),
    ).toBeDisabled()
    if (scenario.id === 'L190') {
      for (const [route, label] of [
        ['subnames', 'Create subname'],
        ['ownership', 'Transfer'],
        ['resolver', 'Change resolver'],
      ]) {
        await page.goto(`/${name}/${route}`)
        await expect(
          page.locator('main').getByRole('heading', { level: 1 }),
        ).toBeVisible()
        await expect(
          page.getByRole('link', { name: new RegExp(`${label}$`) }),
        ).toHaveCount(0)
      }
    }
  })
}
