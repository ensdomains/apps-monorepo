import { setPrimaryName } from '@ensdomains/ensjs/wallet/v1'
import { namehash, parseAbi } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import {
  V1_ENS_REGISTRY,
  V1_PUBLIC_RESOLVER,
} from '../../../fixtures/makeV1Name.js'
import {
  expect,
  MANAGER_APP_URL,
  PORTAL_APP_URL,
  test,
} from '../../../fixtures/playwright.cross-app.fixture.js'
import { publicClient, walletClient } from '../../../helpers/anvil-client.js'
import { waitForBignameBlock } from '../../../helpers/bigname-sync.js'
import { readPrimaryName } from '../../../helpers/primary-name.js'
import { driveTransactionsToSuccess } from '../../../helpers/transaction-modal.js'
import { seedLegacyTree } from '../helpers/legacy-tree.js'
import {
  profileResolver,
  seedProfileRecords,
} from '../helpers/profile-records.js'

for (const id of ['L266', 'L267', 'L268']) {
  test(`${id} recover primary name with unauthorized resolver`, async ({
    explorer,
    manager,
    accounts,
  }, info) => {
    test.setTimeout(180_000)
    const user = accounts.getAddress('user'),
      account = privateKeyToAccount(accounts.getPrivateKey('user'))
    const { name } = await seedLegacyTree(
      {
        label: id,
        type: 'wrapped',
        owner: 'user2',
        subnames: [
          {
            label: 'test',
            owner: 'user',
            records:
              id === 'L267'
                ? { coins: [{ coin: 'eth', value: user }] }
                : undefined,
          },
        ],
      },
      id,
      accounts,
    )
    const unauthorized = await profileResolver(
      'owned',
      privateKeyToAccount(accounts.getPrivateKey('user3')),
    )
    await seedProfileRecords(
      name,
      account,
      true,
      {},
      { resolver: unauthorized },
    )
    await publicClient.waitForTransactionReceipt({
      hash: await setPrimaryName(
        walletClient as never,
        { account, name: id === 'L268' ? name : '' } as never,
      ),
    })
    await waitForBignameBlock()
    const page = explorer.page
    await page.goto(`${PORTAL_APP_URL}/${name}/resolver`)
    await page.getByRole('link', { name: /Change resolver$/ }).click()
    await page.locator('#resolver-address').fill(V1_PUBLIC_RESOLVER)
    await page
      .getByRole('button', { name: 'Save changes', exact: true })
      .click()
    await driveTransactionsToSuccess(page, explorer.wallet, [
      'tx-change-resolver',
    ])
    if (id !== 'L267') {
      await page.goto(`${PORTAL_APP_URL}/${name}/edit-records`)
      await page.getByLabel('Type', { exact: true }).selectOption('address')
      await page.locator('button[role="combobox"]').click()
      await page.getByPlaceholder('Search coins...').fill('ETH')
      await page
        .getByRole('button', { name: /^ETH\b/i })
        .first()
        .click()
      await page.getByLabel('Value', { exact: true }).fill(user)
      await page
        .getByRole('button', { name: 'Add record', exact: true })
        .click()
      await page.getByRole('button', { name: /^Save \d+ changes?$/ }).click()
      await driveTransactionsToSuccess(page, explorer.wallet, [
        'tx-save-resolver-records',
      ])
    }
    if (id !== 'L268') {
      await page.goto(`${PORTAL_APP_URL}/addr/${user}/reverse-resolution`)
      await page
        .getByRole('row')
        .filter({ has: page.getByText('Mainnet', { exact: true }) })
        .getByRole('button', { name: 'More', exact: true })
        .click()
      const sheet = page.getByRole('dialog', { name: 'Mainnet resolution' })
      await sheet.locator('input[name="name"]').fill(name)
      await sheet.getByRole('button', { name: 'Update', exact: true }).click()
      await driveTransactionsToSuccess(page, explorer.wallet, [
        'tx-update-reverse-name',
      ])
    }
    await expect.poll(() => readPrimaryName(user)).toBe(name)
    expect(
      (
        await publicClient.readContract({
          address: V1_ENS_REGISTRY,
          abi: parseAbi(['function resolver(bytes32) view returns(address)']),
          functionName: 'resolver',
          args: [namehash(name)],
        })
      ).toLowerCase(),
    ).toBe(V1_PUBLIC_RESOLVER.toLowerCase())
    await manager.page.goto(`${MANAGER_APP_URL}/dashboard`)
    await expect(
      manager.page.getByRole('link', { name: /^Go to profile/i }),
    ).toHaveAttribute('href', `/${name}`)
    await info.attach('primary-repair-workaround', {
      body: `Explorer Resolver → Change to public resolver; ${id === 'L267' ? 'retain the existing ETH record' : 'add ETH through Edit records'}; ${id === 'L268' ? 'retain the existing reverse record without another reverse transaction' : 'set Mainnet reverse name'}. Verify primary in Manager.`,
      contentType: 'text/plain',
    })
  })
}
