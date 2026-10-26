import { encodeFunctionData, labelhash, parseAbi } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import {
  createMakeV1Name,
  V1_BASE_REGISTRAR,
} from '../../../fixtures/makeV1Name.js'
import { makeV1RegistrySubname } from '../../../fixtures/makeV1RegistrySubname.js'
import { makeV1Subname } from '../../../fixtures/makeV1Subname.js'
import {
  asAccount,
  expect,
  MANAGER_APP_URL,
  test,
} from '../../../fixtures/playwright.cross-app.fixture.js'
import { APP_V1_CONTROLLER } from '../../../fixtures/v1-controller-auth.js'
import {
  publicClient,
  testClient,
  walletClient,
} from '../../../helpers/anvil-client.js'
import { waitForBignameBlock } from '../../../helpers/bigname-sync.js'

const prefix = `legacy-list-${Date.now()}`
let names: string[] = []
for (const id of ['L081', 'L082', 'L083', 'L084']) {
  test(`${id} all V1 roots and subnames remain visible under sorting`, async ({
    manager,
    accounts,
  }, info) => {
    test.setTimeout(300_000)
    const account = privateKeyToAccount(accounts.getPrivateKey('user4'))
    if (!names.length) {
      const seeded: string[] = []
      for (let i = 0; i < 4; i++) {
        const wrapped = i === 0 || i === 2
        const root = await createMakeV1Name({ userAccount: account })({
          label: `${prefix}-${i}`,
          type: wrapped ? 'locked' : 'unwrapped',
        })
        seeded.push(root)
        for (let j = 0; j < 10; j++) {
          const args = {
            parentName: root.replace(/\.eth$/, ''),
            childLabel: `sub${j}`,
            ownerAddress: account.address,
            parentOwnerAccount: account,
          }
          seeded.push(
            wrapped
              ? await makeV1Subname({ ...args, fuses: 0 })
              : await makeV1RegistrySubname(args),
          )
        }
      }
      names = seeded
    }
    await waitForBignameBlock()
    await asAccount(manager, accounts, 'user4')
    const page = manager.page
    await page.goto(`${MANAGER_APP_URL}/dashboard`)
    await page.getByPlaceholder('Search my names').fill(prefix)
    await page.getByRole('button', { name: /^Sort by/ }).click()
    await page
      .getByRole('menuitemradio', {
        name: id === 'L081' || id === 'L082' ? 'Expiry Date' : 'Created',
        exact: true,
      })
      .click()
    // Owned lists default to ascending; changing the field preserves the direction.
    if (id === 'L082' || id === 'L084')
      await page
        .getByRole('button', { name: 'Toggle sort direction', exact: true })
        .click()
    const seen = new Set<string>()
    for (let p = 0; p < 10; p++) {
      await page.waitForLoadState('networkidle')
      for (const href of await page
        .locator('main a[href]')
        .evaluateAll((links) => links.map((a) => a.getAttribute('href') ?? '')))
        seen.add(decodeURIComponent(href))
      const next = page.getByRole('button', { name: 'Next page', exact: true })
      if (!(await next.count()) || !(await next.isEnabled())) break
      const before = await page.locator('main').innerText()
      await next.click()
      await expect.poll(() => page.locator('main').innerText()).not.toBe(before)
    }
    await info.attach('listed-names', {
      body: JSON.stringify({ expected: names, links: [...seen] }),
      contentType: 'application/json',
    })
    for (const name of names) {
      const [label, ...rest] = name.split('.')
      const encoded = `[${labelhash(label).slice(2)}].${rest.join('.')}`
      expect(
        seen.has(`/${name}`) || seen.has(`/${encoded}`),
        `${name} (or hashed-label form) absent after pagination`,
      ).toBe(true)
    }
  })
}
test('L080 twenty V1 names with identical expiry display consistently', async ({
  manager,
  accounts,
}, info) => {
  test.setTimeout(300_000)
  const account = privateKeyToAccount(accounts.getPrivateKey('user2')),
    batch = `l080-${Date.now()}`,
    roots: string[] = []
  for (let i = 0; i < 20; i++)
    roots.push(
      await createMakeV1Name({ userAccount: account })({
        label: `${batch}-${i}`,
        type: 'unwrapped',
      }),
    )
  const read = (name: string) =>
    publicClient.readContract({
      address: V1_BASE_REGISTRAR,
      abi: parseAbi(['function nameExpires(uint256) view returns(uint256)']),
      functionName: 'nameExpires',
      args: [BigInt(labelhash(name.split('.')[0]))],
    })
  const expiries = await Promise.all(roots.map(read)),
    target = expiries.reduce((a, b) => (a > b ? a : b)) + 86400n
  await testClient.impersonateAccount({ address: APP_V1_CONTROLLER })
  await testClient.setBalance({ address: APP_V1_CONTROLLER, value: 10n ** 19n })
  try {
    for (const [i, name] of roots.entries())
      expect(
        (
          await publicClient.waitForTransactionReceipt({
            hash: await walletClient.sendTransaction({
              account: APP_V1_CONTROLLER,
              to: V1_BASE_REGISTRAR,
              data: encodeFunctionData({
                abi: parseAbi([
                  'function renew(uint256,uint256) returns(uint256)',
                ]),
                functionName: 'renew',
                args: [
                  BigInt(labelhash(name.split('.')[0])),
                  target - expiries[i],
                ],
              }),
            }),
          })
        ).status,
      ).toBe('success')
  } finally {
    await testClient.stopImpersonatingAccount({ address: APP_V1_CONTROLLER })
  }
  for (const name of roots) expect(await read(name)).toBe(target)
  await waitForBignameBlock()
  await asAccount(manager, accounts, 'user2')
  const page = manager.page
  const expiryTexts: string[] = []
  for (const name of roots) {
    await page.goto(`${MANAGER_APP_URL}/dashboard`)
    await page.getByPlaceholder('Search my names').fill(name)
    const link = page.locator(`a[href="/${name}"]`)
    await expect(link).toBeVisible()
    const card = link.locator(
      'xpath=ancestor::*[.//*[contains(text(),"Expires")]][1]',
    )
    expiryTexts.push(await card.innerText())
  }
  await info.attach('equal-expiry-displays', {
    body: JSON.stringify({ target: String(target), expiryTexts }),
    contentType: 'application/json',
  })
  const expectedDate = await page.evaluate(
    (timestamp) =>
      new Date(timestamp).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      }),
    Number(target) * 1000,
  )
  for (const text of expiryTexts) expect(text).toContain(expectedDate)
})
