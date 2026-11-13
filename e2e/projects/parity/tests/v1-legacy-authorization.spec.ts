import { namehash, parseAbi } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import {
  V1_ENS_REGISTRY,
  V1_NAME_WRAPPER,
  V1_PUBLIC_RESOLVER,
} from '../../../fixtures/makeV1Name.js'
import {
  asAccount,
  expect,
  MANAGER_APP_URL,
  PORTAL_APP_URL,
  test,
} from '../../../fixtures/playwright.cross-app.fixture.js'
import { publicClient } from '../../../helpers/anvil-client.js'
import { waitForBignameBlock } from '../../../helpers/bigname-sync.js'
import { driveTransactionsToSuccess } from '../../../helpers/transaction-modal.js'
import { seedLegacyTree } from '../helpers/legacy-tree.js'
import {
  defaults,
  profileResolver,
  seedProfileRecords,
} from '../helpers/profile-records.js'

for (const id of ['L231', 'L269', 'L271']) {
  test(`${id} unauthorized resolver and split manager action restrictions`, async ({
    explorer,
    manager,
    accounts,
  }, info) => {
    const account = privateKeyToAccount(accounts.getPrivateKey('user'))
    const { name } = await seedLegacyTree(
      id === 'L271'
        ? {
            label: id,
            type: 'legacy',
            owner: 'user',
            manager: 'user2',
            records: {
              coins: [{ coin: 'eth', value: accounts.getAddress('user2') }],
            },
          }
        : { label: id, type: 'wrapped', owner: 'user' },
      id,
      accounts,
    )
    if (id !== 'L271') {
      const resolver = await profileResolver(
        'owned',
        privateKeyToAccount(accounts.getPrivateKey('user3')),
      )
      await seedProfileRecords(name, account, true, {}, { resolver })
      const page = explorer.page
      await page.goto(`${PORTAL_APP_URL}/${name}/fuses/burn`)
      for (const fuse of ['Cannot Unwrap', 'Cannot Set Resolver'])
        await page
          .getByText(fuse, { exact: true })
          .locator('..')
          .getByRole('checkbox')
          .check()
      await page
        .getByRole('button', { name: 'Save changes', exact: true })
        .click()
      await driveTransactionsToSuccess(page, explorer.wallet, ['tx-burn-fuses'])
      const data = await publicClient.readContract({
        address: V1_NAME_WRAPPER,
        abi: parseAbi([
          'function getData(uint256) view returns(address,uint32,uint64)',
        ]),
        functionName: 'getData',
        args: [BigInt(namehash(name))],
      })
      expect(data[1] & 9).toBe(9)
    }
    await waitForBignameBlock()
    for (const [surface, page, url] of [
      ['Explorer', explorer.page, `${PORTAL_APP_URL}/${name}`],
      ['Manager', manager.page, `${MANAGER_APP_URL}/${name}`],
    ] as const) {
      await page.goto(url)
      await expect(page.locator('main')).toBeVisible()
      await page.waitForLoadState('networkidle')
      await info.attach(surface, {
        body: await page.locator('main').innerText(),
        contentType: 'text/plain',
      })
      const action =
        id === 'L231' ? /Edit (profile|records)/i : /Set as primary name/i
      for (const button of await page
        .getByRole('button', { name: action })
        .or(page.getByRole('link', { name: action }))
        .all())
        if (await button.isVisible())
          await expect(
            button,
            'Forbidden action must be disabled',
          ).toBeDisabled()
    }
    if (id === 'L231') {
      await explorer.page.goto(`${PORTAL_APP_URL}/${name}/records`)
      await expect(explorer.page.locator('main')).toBeVisible()
      await explorer.page.waitForLoadState('networkidle')
      await info.attach('records-edit-entry', {
        body: await explorer.page.locator('main').innerText(),
        contentType: 'text/plain',
      })
      const entry = explorer.page
        .getByRole('link', { name: /Edit records$/ })
        .or(explorer.page.getByRole('button', { name: /Edit records$/ }))
      for (const control of await entry.all())
        if (await control.isVisible())
          await expect(
            control,
            'Profile-edit entry must be unavailable when resolver is unauthorized and replacement is fused off',
          ).toBeDisabled()
    }
    if (id === 'L271')
      expect(
        (
          await publicClient.readContract({
            address: V1_ENS_REGISTRY,
            abi: parseAbi(['function owner(bytes32) view returns(address)']),
            functionName: 'owner',
            args: [namehash(name)],
          })
        ).toLowerCase(),
      ).toBe(accounts.getAddress('user2').toLowerCase())
  })
}
test('L216 replace an owned resolver unauthorized for the name manager', async ({
  explorer,
  accounts,
}, info) => {
  const account = privateKeyToAccount(accounts.getPrivateKey('user2')),
    resolverOwner = privateKeyToAccount(accounts.getPrivateKey('user3'))
  const { name } = await seedLegacyTree(
    { label: 'l216', type: 'legacy', owner: 'user2' },
    'L216',
    accounts,
  )
  const resolver = await profileResolver('owned', resolverOwner)
  // The resolver contract owner can write any node, but the ENS name owner cannot.
  await seedProfileRecords(name, account, false, {}, { resolver })
  const records = defaults(account.address)
  // Seed via the resolver owner without changing registry resolver ownership.
  for (const t of records.texts!) {
    const { walletClient } = await import('../../../helpers/anvil-client.js')
    await publicClient.waitForTransactionReceipt({
      hash: await walletClient.writeContract({
        account: resolverOwner,
        address: resolver,
        abi: parseAbi(['function setText(bytes32,string,string)']),
        functionName: 'setText',
        args: [namehash(name), t.key, t.value],
      }),
    })
  }
  await waitForBignameBlock()
  await asAccount(explorer, accounts, 'user2')
  const page = explorer.page
  await page.goto(`${PORTAL_APP_URL}/${name}/edit-records`)
  await expect(page.locator('main')).toBeVisible()
  await info.attach('unauthorized-editor', {
    body: await page.locator('main').innerText(),
    contentType: 'text/plain',
  })
  await page.goto(`${PORTAL_APP_URL}/${name}/resolver`)
  await page.getByRole('link', { name: /Change resolver$/ }).click()
  await page.locator('#resolver-address').fill(V1_PUBLIC_RESOLVER)
  await page.getByRole('button', { name: 'Save changes', exact: true }).click()
  await driveTransactionsToSuccess(page, explorer.wallet, [
    'tx-change-resolver',
  ])
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
  await info.attach('resolver-recovery-workaround', {
    body: 'Manually open Explorer Resolver and set the public resolver address as the name owner. The old unauthorized-resolver warning/automatic recovery is replaced by a separate page.',
    contentType: 'text/plain',
  })
})
