import { namehash, parseAbi, toHex } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import {
  createMakeV1Name,
  V1_BASE_REGISTRAR,
  V1_ENS_REGISTRY,
  V1_NAME_WRAPPER,
  V1_PUBLIC_RESOLVER,
} from '../../../fixtures/makeV1Name.js'
import {
  connectWithHeadlessWallet,
  expect,
  test,
} from '../../../fixtures/playwright.portal.fixture.js'
import { RESOLVER_ABI } from '../../../fixtures/v1-records.js'
import { publicClient, walletClient } from '../../../helpers/anvil-client.js'
import { waitForBignameBlock } from '../../../helpers/bigname-sync.js'
import { driveTransactionsToSuccess } from '../../../helpers/transaction-modal.js'
import {
  defaults,
  profileResolver,
  seedProfileRecords as setV1RecordsOn,
} from '../helpers/profile-records.js'

for (const n of [217, 218, 219, 220, 221, 222, 223, 224, 225, 226, 227]) {
  const id = `L${n}`
  test(`${id} repair resolver and preserve the selected legacy profile`, async ({
    portalPage: page,
    wallet,
    accounts,
  }, info) => {
    test.setTimeout(240_000)
    const account = privateKeyToAccount(accounts.getPrivateKey('user')),
      records = defaults(account.address)
    const legacy =
      n === 217 ? V1_NAME_WRAPPER : await profileResolver('legacy', account)
    const name = await createMakeV1Name({ userAccount: account })({
      label: id.toLowerCase(),
      type: 'unwrapped',
    })
    const node = namehash(name),
      oldHasRecords = n >= 221,
      latestHasRecords = n === 219 || n === 220 || n >= 223
    if (oldHasRecords) {
      const oldRecords =
        n >= 226
          ? {
              ...records,
              texts: records.texts!.map((t) =>
                t.key === 'description'
                  ? { ...t, value: 'Do not set me as resolver' }
                  : t,
              ),
            }
          : records
      await setV1RecordsOn(name, account, false, oldRecords, {
        resolver: legacy,
      })
    }
    if (n !== 217) {
      const approve = await walletClient.writeContract({
        account,
        address: V1_BASE_REGISTRAR,
        abi: parseAbi(['function setApprovalForAll(address,bool)']),
        functionName: 'setApprovalForAll',
        args: [V1_NAME_WRAPPER, true],
      })
      await publicClient.waitForTransactionReceipt({ hash: approve })
      const wrap = await walletClient.writeContract({
        account,
        address: V1_NAME_WRAPPER,
        abi: parseAbi(['function wrapETH2LD(string,address,uint16,address)']),
        functionName: 'wrapETH2LD',
        args: [name.split('.')[0], account.address, 0, legacy],
      })
      await publicClient.waitForTransactionReceipt({ hash: wrap })
    }
    if (latestHasRecords)
      await setV1RecordsOn(
        name,
        account,
        n !== 217,
        n === 225
          ? {
              ...records,
              texts: records.texts!.map((t) =>
                t.key === 'description'
                  ? { ...t, value: 'Do not set me as resolver' }
                  : t,
              ),
            }
          : records,
      )
    await setV1RecordsOn(name, account, n !== 217, {}, { resolver: legacy })
    await waitForBignameBlock()
    await connectWithHeadlessWallet(page, wallet)
    await page.goto(`/${name}/edit-records`)
    await expect(page.locator('main')).toBeVisible()
    await info.attach('incompatible-resolver-editor', {
      body: await page.locator('main').innerText(),
      contentType: 'text/plain',
    })
    await page.goto(`/${name}/resolver`)
    await page.getByRole('link', { name: /Change resolver$/ }).click()
    await page.locator('#resolver-address').fill(V1_PUBLIC_RESOLVER)
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
          args: [node],
        })
      ).toLowerCase(),
    ).toBe(V1_PUBLIC_RESOLVER.toLowerCase())
    await waitForBignameBlock()
    const reset = [220, 224, 227].includes(n),
      copy = [221, 225].includes(n)
    if (reset || copy) {
      await page.goto(`/${name}/edit-records`)
      await expect(page.getByLabel('Type', { exact: true })).toBeVisible()
      if (latestHasRecords) {
        await page.reload()
        await page.waitForLoadState('networkidle')
        if (
          (await page
            .getByRole('checkbox', { name: 'Select row', exact: true })
            .count()) !== 8
        ) {
          await info.attach('resolver-key-refresh', {
            body: 'The newly selected resolver has eight records on chain, but its indexed keys are stale. Wait 65 seconds and reload before reset/copy; assert all eight rows before modifying anything.',
            contentType: 'text/plain',
          })
          await page.waitForTimeout(65_000)
          await page.reload()
        }
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
        await page.getByRole('button', { name: /^Save \d+ changes?$/ }).click()
        await driveTransactionsToSuccess(page, wallet, [
          'tx-save-resolver-records',
        ])
      }
      if (copy) {
        await page.goto(`/${name}/edit-records`)
        for (const { key, value } of records.texts!) {
          await page.getByLabel('Type', { exact: true }).selectOption('text')
          await page.getByLabel('Key', { exact: true }).fill(key)
          await page.getByLabel('Value', { exact: true }).fill(value)
          await page
            .getByRole('button', { name: 'Add record', exact: true })
            .click()
        }
        for (const [coin, value] of [
          ['BTC', 'bc1qjqg9slurvjukfl92wp58y94480fvh4uc2pwa6n'],
          ['ETCLEGACY', '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC'],
          ['ETH', account.address],
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
            'ipfs://bafybeico3uuyj3vphxpvbowchdwjlrlrh62awxscrnii7w7flu5z6fk77y',
          ],
          ['abi', '{"test":"test"}'],
        ]) {
          await page.getByLabel('Type', { exact: true }).selectOption(type)
          await page.getByLabel('Value', { exact: true }).fill(value)
          await page
            .getByRole('button', { name: 'Add record', exact: true })
            .click()
        }
        await page.getByRole('button', { name: /^Save \d+ changes?$/ }).click()
        await driveTransactionsToSuccess(page, wallet, [
          'tx-save-resolver-records',
        ])
      }
    }
    const empty = reset || (!copy && !latestHasRecords)
    for (const { key, value } of records.texts!)
      expect(
        await publicClient.readContract({
          address: V1_PUBLIC_RESOLVER,
          abi: RESOLVER_ABI,
          functionName: 'text',
          args: [node, key],
        }),
      ).toBe(empty ? '' : value)
    for (const { coinType, value } of records.addresses!)
      expect(
        (
          await publicClient.readContract({
            address: V1_PUBLIC_RESOLVER,
            abi: RESOLVER_ABI,
            functionName: 'addr',
            args: [node, BigInt(coinType)],
          })
        )
          .toLowerCase()
          .replace(/^0x0{40}$/, '0x'),
      ).toBe(empty ? '0x' : value.toLowerCase())
    expect(
      await publicClient.readContract({
        address: V1_PUBLIC_RESOLVER,
        abi: RESOLVER_ABI,
        functionName: 'contenthash',
        args: [node],
      }),
    ).toBe(empty ? '0x' : records.contenthash)
    expect(
      (
        await publicClient.readContract({
          address: V1_PUBLIC_RESOLVER,
          abi: RESOLVER_ABI,
          functionName: 'ABI',
          args: [node, 1n],
        })
      )[1],
    ).toBe(empty ? '0x' : toHex('{"test":"test"}'))
    await page.goto(`/${name}/records`)
    await expect(
      page.locator('main').getByRole('heading', { level: 1 }),
    ).toBeVisible()
    if (!empty) await expect(page.locator('main')).toContainText('Hello2')
    await info.attach('repair-workaround', {
      body: `Manual Explorer Resolver → Change resolver with the public resolver address; ${reset ? 'then delete all records on the latest resolver' : copy ? 'then manually re-enter all eight original records through Edit records' : 'retain the existing latest-resolver profile'}. This replaces the old guided profile chooser. Record values verified on chain.`,
      contentType: 'text/plain',
    })
  })
}
