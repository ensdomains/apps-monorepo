import { encodeContentHash } from '@ensdomains/ensjs/utils'
import { type Hex, namehash, toHex } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { createMakeV1Name } from '../../../fixtures/makeV1Name.js'
import {
  connectWithHeadlessWallet,
  expect,
  test,
} from '../../../fixtures/playwright.portal.fixture.js'
import { RESOLVER_ABI } from '../../../fixtures/v1-records.js'
import { publicClient } from '../../../helpers/anvil-client.js'
import { waitForBignameBlock } from '../../../helpers/bigname-sync.js'
import { driveTransactionsToSuccess } from '../../../helpers/transaction-modal.js'
import {
  encodeCoin,
  profileResolver,
  seedProfileRecords as setV1RecordsOn,
} from '../helpers/profile-records.js'

for (const id of ['L025', 'L026']) {
  test(`${id} pending record changes survive returning from transaction review`, async ({
    portalPage: page,
    wallet,
    accounts,
  }, info) => {
    test.setTimeout(180_000)
    const account = privateKeyToAccount(accounts.getPrivateKey('user')),
      resolver = await profileResolver('legacy', account)
    const name = await createMakeV1Name({ userAccount: account })({
        label: id.toLowerCase(),
        type: 'unwrapped',
      }),
      node = namehash(name)
    await setV1RecordsOn(
      name,
      account,
      false,
      {
        texts: [
          { key: 'name', value: 'Bob' },
          { key: 'text', value: 'text' },
          { key: 'com.twitter', value: '@test' },
        ],
        addresses: [
          {
            coinType: 501,
            value: encodeCoin(
              'sol',
              'HN7cABqLq46Es1jh92dQQisAq662SmxELLLsHHe4YWrH',
            ),
          },
          { coinType: 60, value: '0xbec1C7C11F2Fa9AB24b9E49122D26e721766DAF6' },
          {
            coinType: 0,
            value: encodeCoin('btc', '1PzAJcFtEiXo9UGtRU6iqXQKj8NXtcC7DE'),
          },
          ...(id === 'L025'
            ? [
                {
                  coinType: 784,
                  value:
                    '0x1231231231231231231231231231231231231231231231231231231231231231' as Hex,
                },
              ]
            : []),
        ],
        contenthash: encodeContentHash(
          'ipfs://bafybeico3uuyj3vphxpvbowchdwjlrlrh62awxscrnii7w7flu5z6fk77y',
        ) as Hex,
        abis: [
          {
            contentType: id === 'L025' ? 1 : 8,
            data: toHex(
              id === 'L025' ? '{"test":"test"}' : 'https://example.com',
            ),
          },
        ],
      },
      { resolver },
    )
    await page.route('https://example.com', (route) =>
      route.fulfill({
        contentType: 'application/json',
        body: '{"test":"test"}',
      }),
    )
    await waitForBignameBlock()
    await connectWithHeadlessWallet(page, wallet)
    await page.goto(`/${name}/edit-records`)
    const remove = async (key: string) => {
      const row = page
        .getByRole('row')
        .filter({ has: page.getByText(new RegExp(`^${key}$`, 'i')) })
      await row
        .getByRole('button', { name: 'Delete record', exact: true })
        .click()
      await page.getByRole('button', { name: 'Confirm', exact: true }).click()
    }
    for (const key of id === 'L025'
      ? ['text', 'SOL', 'ETH', 'SUI', 'contentHash', 'abi']
      : ['name', 'ETH', 'contentHash', 'abi'])
      await remove(key)
    if (id === 'L026') {
      for (const [key, value] of [
        ['name', 'Nick'],
        ['another text', 'another record'],
      ]) {
        await page.getByLabel('Type', { exact: true }).selectOption('text')
        await page.getByLabel('Key', { exact: true }).fill(key)
        await page.getByLabel('Value', { exact: true }).fill(value)
        await page
          .getByRole('button', { name: 'Add record', exact: true })
          .click()
      }
      for (const [coin, value] of [
        ['ETH', accounts.getAddress('user2')],
        ['BNB', 'bnb1g5p04snezgpky203fq6da9qyjsy2k9kzr5yuhl'],
      ]) {
        await page.getByLabel('Type', { exact: true }).selectOption('address')
        await page.locator('button[role="combobox"]').click()
        await page.getByPlaceholder('Search coins...').fill(coin)
        await page
          .getByRole('button', { name: new RegExp(`^${coin}\\b`, 'i') })
          .first()
          .click()
        await page.getByLabel('Value', { exact: true }).fill(value)
        await page
          .getByRole('button', { name: 'Add record', exact: true })
          .click()
      }
      for (const [type, value] of [
        [
          'contentHash',
          'bzz://e40101fa011b20d1de9994b4d039f6548d191eb26786769f580809256b4685ef316805265ea162',
        ],
        ['abi', '{"test2":"test2"}'],
      ]) {
        await page.getByLabel('Type', { exact: true }).selectOption(type)
        await page.getByLabel('Value', { exact: true }).fill(value)
        await page
          .getByRole('button', { name: 'Add record', exact: true })
          .click()
      }
    }
    const save = page.getByRole('button', { name: /^Save \d+ changes?$/ })
    const saveLabel = await save.innerText()
    await save.click()
    await expect(
      page.getByRole('dialog', { name: 'Transaction overview' }),
    ).toBeVisible()
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'Close', exact: true })
      .click()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(save).toHaveText(saveLabel)
    if (id === 'L025')
      for (const key of ['text', 'SOL', 'ETH', 'SUI', 'contentHash', 'abi'])
        await expect(
          page
            .getByRole('row')
            .filter({ has: page.getByText(new RegExp(`^${key}$`, 'i')) }),
        ).toHaveCount(0)
    else
      for (const value of ['Nick', 'another record'])
        await expect(page.locator('main')).toContainText(value)
    await save.click()
    await driveTransactionsToSuccess(page, wallet, ['tx-save-resolver-records'])
    const text = (key: string) =>
      publicClient.readContract({
        address: resolver,
        abi: RESOLVER_ABI,
        functionName: 'text',
        args: [node, key],
      })
    expect(await text('name')).toBe(id === 'L025' ? 'Bob' : 'Nick')
    expect(await text('text')).toBe(id === 'L025' ? '' : 'text')
    expect(await text('com.twitter')).toBe('@test')
    const addr = await publicClient.readContract({
      address: resolver,
      abi: RESOLVER_ABI,
      functionName: 'addr',
      args: [node, 60n],
    })
    expect(addr.toLowerCase()).toBe(
      id === 'L025'
        ? `0x${'0'.repeat(40)}`
        : accounts.getAddress('user2').toLowerCase(),
    )
    if (id === 'L025')
      for (const coin of [501n, 784n])
        expect(
          await publicClient.readContract({
            address: resolver,
            abi: RESOLVER_ABI,
            functionName: 'addr',
            args: [node, coin],
          }),
        ).toBe('0x')
    else {
      expect(await text('another text')).toBe('another record')
      expect(
        await publicClient.readContract({
          address: resolver,
          abi: RESOLVER_ABI,
          functionName: 'addr',
          args: [node, 714n],
        }),
      ).toBe(encodeCoin('bnb', 'bnb1g5p04snezgpky203fq6da9qyjsy2k9kzr5yuhl'))
    }
    expect(
      await publicClient.readContract({
        address: resolver,
        abi: RESOLVER_ABI,
        functionName: 'contenthash',
        args: [node],
      }),
    ).toBe(
      id === 'L025'
        ? '0x'
        : encodeContentHash(
            'bzz://e40101fa011b20d1de9994b4d039f6548d191eb26786769f580809256b4685ef316805265ea162',
          ),
    )
    expect(
      (
        await publicClient.readContract({
          address: resolver,
          abi: RESOLVER_ABI,
          functionName: 'ABI',
          args: [node, 1n],
        })
      )[1],
    ).toBe(id === 'L025' ? '0x' : toHex('{"test2":"test2"}'))
    await info.attach('review-return-adaptation', {
      body: 'Close the unstarted transaction overview to return to Explorer Edit records; pending changes must survive and be submitted once when Save is reopened.',
      contentType: 'text/plain',
    })
  })
}
