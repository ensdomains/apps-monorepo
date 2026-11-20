import { type Hex, namehash, parseAbi, toHex } from 'viem'
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
import { RESOLVER_ABI, setV1RecordsOn } from '../../../fixtures/v1-records.js'
import { publicClient, walletClient } from '../../../helpers/anvil-client.js'
import { waitForBignameBlock } from '../../../helpers/bigname-sync.js'
import { driveTransactionsToSuccess } from '../../../helpers/transaction-modal.js'
import v1 from '../artifacts/OutdatedResolverV1.json' with { type: 'json' }
import v3 from '../artifacts/OutdatedResolverV3.json' with { type: 'json' }
import { defaults } from '../helpers/profile-records.js'

for (const id of ['L210', 'L211', 'L212', 'L213']) {
  test(`${id} outdated resolver manual replacement and profile choice`, async ({
    portalPage: page,
    wallet,
    accounts,
  }, info) => {
    test.setTimeout(240_000)
    const account = privateKeyToAccount(accounts.getPrivateKey('user')),
      artifact = id === 'L213' ? v3 : v1
    expect(artifact.bytecode.slice(-64)).toBe(
      '000000000000000000000000314159265dd8dbb310642f98f50c066173c1259b',
    )
    const deployed = await publicClient.waitForTransactionReceipt({
      hash: await walletClient.deployContract({
        account,
        abi: artifact.abi,
        // Archived creation data already ends in its original constructor argument.
        // Replace that argument through deployContract; preserve the runtime bytecode.
        bytecode: artifact.bytecode.slice(0, -64) as Hex,
        args: [V1_ENS_REGISTRY],
      }),
    })
    if (!deployed.contractAddress || deployed.status !== 'success')
      throw new Error('Outdated resolver deployment failed')
    if (id !== 'L213')
      expect(
        (
          await publicClient.getStorageAt({
            address: deployed.contractAddress,
            slot: '0x0',
          })
        )
          ?.slice(-40)
          .toLowerCase(),
      ).toBe(V1_ENS_REGISTRY.slice(2).toLowerCase())
    const resolver = deployed.contractAddress,
      name = await createMakeV1Name({ userAccount: account })({
        label: id.toLowerCase(),
        type: 'unwrapped',
      }),
      node = namehash(name),
      records = defaults(account.address)
    if (id === 'L213') {
      // V3 has a different storage layout. Verify registry authority through supported writes.
      const abi = parseAbi([
        'function setAddr(bytes32,address)',
        'function addr(bytes32) view returns(address)',
      ])
      for (const value of [
        account.address,
        '0x0000000000000000000000000000000000000000',
      ] as const) {
        const hash = await walletClient.writeContract({
          account,
          address: resolver,
          abi,
          functionName: 'setAddr',
          args: [node, value],
        })
        expect(
          (await publicClient.waitForTransactionReceipt({ hash })).status,
        ).toBe('success')
        expect(
          (
            await publicClient.readContract({
              address: resolver,
              abi,
              functionName: 'addr',
              args: [node],
            })
          ).toLowerCase(),
        ).toBe(value.toLowerCase())
      }
    }
    if (['L211', 'L212'].includes(id)) {
      // V1 resolver predates text, multicoin and contenthash. Seed its supported ETH and ABI records individually.
      for (const hash of [
        await walletClient.writeContract({
          account,
          address: resolver,
          abi: parseAbi(['function setAddr(bytes32,address)']),
          functionName: 'setAddr',
          args: [node, account.address],
        }),
        await walletClient.writeContract({
          account,
          address: resolver,
          abi: RESOLVER_ABI,
          functionName: 'setABI',
          args: [node, 1n, toHex('{"test":"test"}')],
        }),
      ])
        expect(
          (await publicClient.waitForTransactionReceipt({ hash })).status,
        ).toBe('success')
      await setV1RecordsOn(name, account, false, records)
    }
    await setV1RecordsOn(name, account, false, {}, { resolver })
    await connectWithHeadlessWallet(page, wallet)
    await page.goto(`/${name}/edit-records`)
    await expect(page.locator('main')).toBeVisible()
    await info.attach('outdated-editor', {
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
    if (id === 'L212') {
      await waitForBignameBlock()
      await page.goto(`/${name}/edit-records`)
      await expect(page.getByLabel('Type', { exact: true })).toBeVisible()
      await page.waitForLoadState('networkidle')
      if (
        (await page
          .getByRole('checkbox', { name: 'Select row', exact: true })
          .count()) !== 8
      ) {
        await info.attach('resolver-key-refresh', {
          body: 'Wait 65 seconds and reload to expose all eight records on the newly selected resolver before resetting them.',
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
    expect(
      (
        await publicClient.readContract({
          address: V1_ENS_REGISTRY,
          abi: parseAbi(['function resolver(bytes32) view returns(address)']),
          functionName: 'resolver',
          args: [node],
        })
      ).toLowerCase(),
    ).toBe(V1_PUBLIC_RESOLVER.toLowerCase())
    for (const { key, value } of records.texts!)
      expect(
        await publicClient.readContract({
          address: V1_PUBLIC_RESOLVER,
          abi: RESOLVER_ABI,
          functionName: 'text',
          args: [node, key],
        }),
      ).toBe(id === 'L211' ? value : '')
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
      ).toBe(id === 'L211' ? value.toLowerCase() : '0x')
    expect(
      await publicClient.readContract({
        address: V1_PUBLIC_RESOLVER,
        abi: RESOLVER_ABI,
        functionName: 'contenthash',
        args: [node],
      }),
    ).toBe(id === 'L211' ? records.contenthash : '0x')
    expect(
      (
        await publicClient.readContract({
          address: V1_PUBLIC_RESOLVER,
          abi: RESOLVER_ABI,
          functionName: 'ABI',
          args: [node, 1n],
        })
      )[1],
    ).toBe(id === 'L211' ? toHex('{"test":"test"}') : '0x')
    await info.attach('outdated-repair-workaround', {
      body: 'Explorer Resolver → Change resolver → explicit public resolver address. Existing latest profile is retained, or reset separately through Edit records → Select all → Delete → Save. This replaces the old automatic outdated-resolver warning and guided choice.',
      contentType: 'text/plain',
    })
  })
}
