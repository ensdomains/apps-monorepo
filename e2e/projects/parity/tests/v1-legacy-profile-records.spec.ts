import { namehash, parseAbi, toHex } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import {
  createMakeV1Name,
  V1_ENS_REGISTRY,
} from '../../../fixtures/makeV1Name.js'
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
  defaults,
  encodeCoin,
  profileResolver,
  seedProfileRecords as setV1RecordsOn,
} from '../helpers/profile-records.js'

const image =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
for (const n of [202, 203, 204, 205, 206, 207, 208, 209]) {
  const id = `L${n}`,
    kind =
      n < 204 ? 'legacy' : n < 206 ? 'custom' : n < 208 ? 'public' : 'wrapper',
    wrapped = n >= 206,
    deleting = n % 2 === 1
  test(`${id} ${deleting ? 'delete' : 'add and update'} original profile records on ${kind} resolver`, async ({
    portalPage: page,
    wallet,
    accounts,
  }, info) => {
    test.setTimeout(240_000)
    const account = privateKeyToAccount(accounts.getPrivateKey('user'))
    const resolver = await profileResolver(kind, account)
    const name = await createMakeV1Name({ userAccount: account })({
      label: id.toLowerCase(),
      type: wrapped ? 'wrapped' : 'unwrapped',
    })
    await setV1RecordsOn(name, account, wrapped, defaults(account.address), {
      resolver,
    })
    await waitForBignameBlock()
    await connectWithHeadlessWallet(page, wallet)
    await page.goto(`/${name}/records`)
    for (const value of ['Hello2', 'fakeemail@fake.com', 'https://twitter.com'])
      await expect(page.locator('main')).toContainText(value)
    await page.getByRole('link', { name: /Edit records$/ }).click()
    if (deleting) {
      await expect(
        page.getByRole('checkbox', { name: 'Select row', exact: true }),
      ).toHaveCount(8)
      await page
        .getByRole('checkbox', { name: 'Select all', exact: true })
        .check()
      await page.getByRole('button', { name: 'Delete', exact: true }).click()
      await page
        .getByRole('dialog')
        .getByRole('button', { name: 'Remove', exact: true })
        .click()
    } else {
      // Replace two existing values through explicit remove/add operations; untouched records must survive.
      for (const key of ['description', 'ETH']) {
        const row = page
          .getByRole('row')
          .filter({ has: page.getByText(new RegExp(`^${key}$`, 'i')) })
        await row
          .getByRole('button', { name: 'Delete record', exact: true })
          .click()
        await page.getByRole('button', { name: 'Confirm', exact: true }).click()
      }
      const texts = [
        ['description', 'new name'],
        ['location', 'L1 chain'],
        ...(n <= 204
          ? [
              ['avatar', image],
              ['header', image],
            ]
          : []),
      ]
      for (const [key, value] of texts) {
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
    }
    await page.getByRole('button', { name: /^Save \d+ changes?$/ }).click()
    await driveTransactionsToSuccess(page, wallet, ['tx-save-resolver-records'])
    const node = namehash(name)
    expect(
      (
        await publicClient.readContract({
          address: V1_ENS_REGISTRY,
          abi: parseAbi(['function resolver(bytes32) view returns (address)']),
          functionName: 'resolver',
          args: [node],
        })
      ).toLowerCase(),
    ).toBe(resolver.toLowerCase())
    for (const [key, value] of [
      ['description', 'new name'],
      ['url', 'https://twitter.com'],
      ['email', 'fakeemail@fake.com'],
      ...(!deleting ? [['location', 'L1 chain']] : []),
      ...(!deleting && n <= 204
        ? [
            ['avatar', image],
            ['header', image],
          ]
        : []),
    ])
      expect(
        await publicClient.readContract({
          address: resolver,
          abi: RESOLVER_ABI,
          functionName: 'text',
          args: [node, key],
        }),
      ).toBe(deleting ? '' : value)
    for (const coin of [0, 60, 61]) {
      const value = await publicClient.readContract({
        address: resolver,
        abi: RESOLVER_ABI,
        functionName: 'addr',
        args: [node, BigInt(coin)],
      })
      const original = defaults(account.address).addresses!.find(
        (a) => a.coinType === coin,
      )!.value
      expect(value.toLowerCase()).toBe(
        deleting
          ? coin === 60
            ? `0x${'0'.repeat(40)}`
            : '0x'
          : coin === 60
            ? accounts.getAddress('user2').toLowerCase()
            : original.toLowerCase(),
      )
    }
    expect(
      await publicClient.readContract({
        address: resolver,
        abi: RESOLVER_ABI,
        functionName: 'contenthash',
        args: [node],
      }),
    ).toBe(deleting ? '0x' : defaults(account.address).contenthash)
    const abi = await publicClient.readContract({
      address: resolver,
      abi: RESOLVER_ABI,
      functionName: 'ABI',
      args: [node, 1n],
    })
    expect(abi[1]).toBe(deleting ? '0x' : toHex('{"test":"test"}'))
    if (!deleting)
      expect(
        await publicClient.readContract({
          address: resolver,
          abi: RESOLVER_ABI,
          functionName: 'addr',
          args: [node, 714n],
        }),
      ).toBe(encodeCoin('bnb', 'bnb1g5p04snezgpky203fq6da9qyjsy2k9kzr5yuhl'))
    await page.goto(`/${name}/records`)
    await expect(
      page.locator('main').getByRole('heading', { level: 1 }),
    ).toBeVisible()
    if (
      !deleting &&
      !(await page.locator('main').innerText()).includes('L1 chain')
    ) {
      await info.attach('new-keys-not-yet-visible', {
        body: await page.locator('main').innerText(),
        contentType: 'text/plain',
      })
      await waitForBignameBlock()
      await page.waitForTimeout(65_000)
      await page.reload()
      await info.attach('record-refresh-workaround', {
        body: 'New keys were present on chain but absent from Records. Wait 65 seconds after indexer catch-up and reload; the subsequent assertions determine whether this workaround succeeds.',
        contentType: 'text/plain',
      })
    }
    if (deleting) {
      for (const value of [
        'Hello2',
        'fakeemail@fake.com',
        'https://twitter.com',
      ])
        await expect(page.locator('main')).not.toContainText(value)
    } else
      for (const value of ['new name', 'L1 chain', 'fakeemail@fake.com'])
        await expect(page.locator('main')).toContainText(value)
    await info.attach('workflow-adaptation', {
      body: 'Explorer typed record editor replaces the old profile wizard. Existing record changes use remove/add before one save. Resolver unchanged; all original record types checked on chain.',
      contentType: 'text/plain',
    })
  })
}
