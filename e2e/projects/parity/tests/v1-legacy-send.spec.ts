import { labelhash, namehash, parseAbi } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import {
  V1_BASE_REGISTRAR,
  V1_ENS_REGISTRY,
  V1_NAME_WRAPPER,
} from '../../../fixtures/makeV1Name.js'
import {
  connectWithHeadlessWallet,
  expect,
  test,
} from '../../../fixtures/playwright.portal.fixture.js'
import { publicClient } from '../../../helpers/anvil-client.js'
import { waitForBignameBlock } from '../../../helpers/bigname-sync.js'
import { driveTransactionsToSuccess } from '../../../helpers/transaction-modal.js'
import { type LegacyName, seedLegacyTree } from '../helpers/legacy-tree.js'
import {
  profileResolver,
  seedProfileRecords,
} from '../helpers/profile-records.js'
import cases from '../ownership-cases.json' with { type: 'json' }

for (const c of cases.filter((c) =>
  [
    'L163',
    'L164',
    'L167',
    'L168',
    'L169',
    'L170',
    'L166',
    'L171',
    'L172',
  ].includes(c.id),
)) {
  test(`${c.id} ${c.title}`, async ({
    portalPage: page,
    wallet,
    accounts,
  }, info) => {
    test.setTimeout(180_000)
    const { name, wrapped, holder } = await seedLegacyTree(
      c.config as LegacyName,
      c.id,
      accounts,
    )
    if (c.id === 'L163') {
      const account = privateKeyToAccount(accounts.getPrivateKey('user'))
      const resolver = await profileResolver('legacy', account)
      await seedProfileRecords(
        name,
        account,
        false,
        {
          addresses: [
            {
              coinType: 60,
              value: '0x42D63ae25990889E35F215bC95884039Ba354115',
            },
          ],
        },
        { resolver },
      )
    }
    await waitForBignameBlock()
    await connectWithHeadlessWallet(page, wallet)
    const node = namehash(name),
      recipient = accounts.getAddress('user3')
    const resolver = await publicClient.readContract({
      address: V1_ENS_REGISTRY,
      abi: parseAbi(['function resolver(bytes32) view returns (address)']),
      functionName: 'resolver',
      args: [node],
    })
    const readEth = () =>
      publicClient.readContract({
        address: resolver,
        abi: parseAbi(['function addr(bytes32) view returns (address)']),
        functionName: 'addr',
        args: [node],
      })
    const oldEth = await readEth()
    const reset = ['L166', 'L171', 'L172'].includes(c.id)
    if (reset) {
      await page.goto(`/${name}/edit-records`)
      await page
        .getByRole('checkbox', { name: 'Select all', exact: true })
        .check()
      await page.getByRole('button', { name: 'Delete', exact: true }).click()
      await page
        .getByRole('dialog')
        .getByRole('button', { name: 'Remove', exact: true })
        .click()
      await page.getByRole('button', { name: /^Save \d+ changes?$/ }).click()
      await driveTransactionsToSuccess(page, wallet, [
        'tx-save-resolver-records',
      ])
      await page.goto(`/${name}/edit-records`)
      await page.getByLabel('Type', { exact: true }).selectOption('address')
      await page.locator('button[role="combobox"]').click()
      await page.getByPlaceholder('Search coins...').fill('ETH')
      await page
        .getByRole('button', { name: /^ETH\b/i })
        .first()
        .click()
      await page.getByLabel('Value', { exact: true }).fill(recipient)
      await page
        .getByRole('button', { name: 'Add record', exact: true })
        .click()
      await page.getByRole('button', { name: /^Save \d+ changes?$/ }).click()
      await driveTransactionsToSuccess(page, wallet, [
        'tx-save-resolver-records',
      ])
      await info.attach('workaround', {
        body: 'Reset profile via Explorer Edit records: delete all records, save; add the recipient ETH record, save; then transfer ownership with the resolver retained and the ETH switch off.',
        contentType: 'text/plain',
      })
    }
    await page.goto(`/${name}/ownership`)
    await page.getByRole('link', { name: 'Transfer', exact: true }).click()
    await page.getByPlaceholder('ENS name or address').fill(recipient)
    await expect(
      page.getByRole('button', { name: 'Transfer name', exact: true }),
    ).toBeEnabled()
    const detach = page.getByRole('switch', { name: /Detach the resolver/ })
    if ((await detach.isVisible()) && (await detach.isChecked()))
      await detach.uncheck()
    const changeEth = !reset && holder === 'user' && c.id !== 'L164'
    const eth = page.getByRole('switch', {
      name: /Set the ETH address to the recipient/,
    })
    if (changeEth) await eth.check()
    else if (
      (await eth.isVisible()) &&
      (await eth.isEnabled()) &&
      (await eth.isChecked())
    )
      await eth.uncheck()
    await page
      .getByRole('button', { name: 'Transfer name', exact: true })
      .click()
    const steps = [
      ...(changeEth ? ['set-eth-addr'] : []),
      ...(['L163', 'L164'].includes(c.id)
        ? ['reclaim', 'transfer-erc721']
        : [
            holder !== 'user'
              ? 'set-subnode-owner'
              : wrapped
                ? 'transfer-erc1155'
                : 'set-registry-owner',
          ]),
    ]
    await driveTransactionsToSuccess(
      page,
      wallet,
      steps.map((s) => `transfer-${name}-${s}`),
    )
    const current = await publicClient.readContract({
      address: wrapped ? V1_NAME_WRAPPER : V1_ENS_REGISTRY,
      abi: parseAbi([
        'function owner(bytes32) view returns (address)',
        'function ownerOf(uint256) view returns (address)',
      ]),
      functionName: wrapped ? 'ownerOf' : 'owner',
      args: [wrapped ? BigInt(node) : node],
    } as never)
    expect(String(current).toLowerCase()).toBe(recipient.toLowerCase())
    expect((await readEth()).toLowerCase()).toBe(
      (changeEth || reset ? recipient : oldEth).toLowerCase(),
    )
    if (['L163', 'L164'].includes(c.id))
      expect(
        (
          await publicClient.readContract({
            address: V1_BASE_REGISTRAR,
            abi: parseAbi(['function ownerOf(uint256) view returns (address)']),
            functionName: 'ownerOf',
            args: [BigInt(labelhash(name.split('.')[0]))],
          })
        ).toLowerCase(),
      ).toBe(recipient.toLowerCase())
    const oldText = 'subnames' in c.config || reset
    if (oldText)
      expect(
        await publicClient.readContract({
          address: resolver,
          abi: parseAbi([
            'function text(bytes32,string) view returns (string)',
          ]),
          functionName: 'text',
          args: [node, 'name'],
        }),
      ).toBe(reset ? '' : 'test')
    await page.goto(`/${name}/ownership`)
    await expect(
      page.locator('main').locator(`a[href*="${recipient}" i]`).first(),
    ).toBeVisible()
  })
}
