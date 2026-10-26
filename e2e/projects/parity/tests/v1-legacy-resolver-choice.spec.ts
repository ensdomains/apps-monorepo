import { namehash, parseAbi } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import {
  createMakeV1Name,
  V1_ENS_REGISTRY,
  V1_PUBLIC_RESOLVER,
} from '../../../fixtures/makeV1Name.js'
import {
  connectWithHeadlessWallet,
  expect,
  test,
} from '../../../fixtures/playwright.portal.fixture.js'
import { publicClient } from '../../../helpers/anvil-client.js'
import { driveTransactionsToSuccess } from '../../../helpers/transaction-modal.js'
import {
  profileResolver,
  seedProfileRecords as setV1RecordsOn,
} from '../helpers/profile-records.js'

for (const id of ['L281', 'L282']) {
  test(`${id} V1 resolver choice via manual Explorer address entry`, async ({
    portalPage: page,
    wallet,
    accounts,
  }, info) => {
    const account = privateKeyToAccount(accounts.getPrivateKey('user'))
    const old = await profileResolver('legacy', account)
    const name = await createMakeV1Name({ userAccount: account })({
      label: id.toLowerCase(),
      type: 'wrapped',
    })
    if (id === 'L282')
      await setV1RecordsOn(name, account, true, {}, { resolver: old })
    await connectWithHeadlessWallet(page, wallet)
    await page.goto(`/${name}/resolver`)
    await page.getByRole('link', { name: /Change resolver$/ }).click()
    const current = id === 'L281' ? V1_PUBLIC_RESOLVER : old,
      target = id === 'L281' ? old : V1_PUBLIC_RESOLVER
    const input = page.locator('#resolver-address')
    await input.fill(current)
    if (id === 'L281')
      await expect
        .soft(
          page.getByRole('button', { name: 'Save changes', exact: true }),
          'Unchanged resolver cannot be submitted',
        )
        .toBeDisabled({ timeout: 3000 })
    await input.fill(target)
    await page
      .getByRole('button', { name: 'Save changes', exact: true })
      .click()
    await driveTransactionsToSuccess(page, wallet, ['tx-change-resolver'])
    expect(
      (
        await publicClient.readContract({
          address: V1_ENS_REGISTRY,
          abi: parseAbi(['function resolver(bytes32) view returns (address)']),
          functionName: 'resolver',
          args: [namehash(name)],
        })
      ).toLowerCase(),
    ).toBe(target.toLowerCase())
    await page.goto(`/${name}/resolver`)
    await expect(
      page.locator('main').locator(`a[href*="${target}" i]:visible`).first(),
    ).toBeVisible()
    await info.attach('resolver-choice-workaround', {
      body: 'Explorer has one custom-address field instead of latest/custom radio buttons. Enter the resolver address explicitly; the resulting resolver is checked on chain.',
      contentType: 'text/plain',
    })
  })
}
