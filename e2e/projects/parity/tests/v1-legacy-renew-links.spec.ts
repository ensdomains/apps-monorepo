import { labelhash, parseAbi } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import {
  createMakeV1Name,
  V1_BASE_REGISTRAR,
} from '../../../fixtures/makeV1Name.js'
import {
  expect,
  MANAGER_APP_URL,
  PORTAL_APP_URL,
  test,
} from '../../../fixtures/playwright.cross-app.fixture.js'
import { publicClient, testClient } from '../../../helpers/anvil-client.js'
import { waitForBignameBlock } from '../../../helpers/bigname-sync.js'

for (const id of ['L065', 'L068', 'L069', 'L070']) {
  test(`${id} renewal URL duration and wallet entry`, async ({
    explorer,
    manager,
    accounts,
  }, info) => {
    const owner = id === 'L065' ? 'user2' : 'user'
    const name = await createMakeV1Name({
      userAccount: privateKeyToAccount(accounts.getPrivateKey(owner)),
    })({
      label: id.toLowerCase(),
      type: id === 'L065' ? 'wrapped' : 'unwrapped',
    })
    if (id === 'L069') {
      const expiry = await publicClient.readContract({
        address: V1_BASE_REGISTRAR,
        abi: parseAbi(['function nameExpires(uint256) view returns(uint256)']),
        functionName: 'nameExpires',
        args: [BigInt(labelhash(name.split('.')[0]))],
      })
      await testClient.setNextBlockTimestamp({ timestamp: expiry + 86400n })
      await testClient.mine({ blocks: 1 })
    }
    await waitForBignameBlock()
    const seconds = id === 'L068' ? 315576000 : id === 'L065' ? 123 : 94608000
    let supported = false
    for (const [surface, page, url] of [
      ['Explorer', explorer.page, `${PORTAL_APP_URL}/${name}?renew=${seconds}`],
      ['Manager', manager.page, `${MANAGER_APP_URL}/${name}?renew=${seconds}`],
    ] as const) {
      // A fresh context represents the original disconnected case, without modifying other tests' wallets.
      const p = id === 'L070' ? await page.context().browser()!.newPage() : page
      await p.goto(url)
      await expect(p.locator('main')).toBeVisible()
      await p.waitForLoadState('networkidle')
      await info.attach(`${surface}-renew-url`, {
        body: await p.locator('body').innerText(),
        contentType: 'text/plain',
      })
      supported ||=
        id === 'L070'
          ? (await p.getByText('Connect a wallet', { exact: true }).count()) > 0
          : (await p.getByRole('dialog').count()) > 0
      if (id === 'L070') await p.close()
    }
    // Dedicated Manager route is useful, but does not preserve the original shared profile URL or its supplied duration.
    await manager.page.goto(
      `${MANAGER_APP_URL}/renew-v1/${name}?renew=${seconds}`,
    )
    await expect(manager.page.locator('main')).toBeVisible()
    await manager.page.waitForLoadState('networkidle')
    await info.attach('dedicated-renewal-route', {
      body: await manager.page.locator('main').innerText(),
      contentType: 'text/plain',
    })
    expect(
      supported,
      'Profile ?renew= link does not initiate renewal in either app. Dedicated renewal route must be opened manually; supplied duration is not certified.',
    ).toBe(true)
    throw new Error(
      'Automatic renewal entry discovered: execute original duration/wallet/transaction assertions before certifying parity',
    )
  })
}
for (const id of ['L066', 'L067']) {
  test(`${id} unregistered renewal link leads to V2 registration`, async ({
    manager,
  }, info) => {
    const name = `${id.toLowerCase()}-unregistered-${Date.now()}.eth`
    const page =
      id === 'L067'
        ? await manager.page.context().browser()!.newPage()
        : manager.page
    try {
      await page.goto(`${MANAGER_APP_URL}/${name}?renew=123`)
      await expect(page.locator('main')).toBeVisible()
      await page.waitForLoadState('networkidle')
      await info.attach('unregistered-renewal-link', {
        body: await page.locator('body').innerText(),
        contentType: 'text/plain',
      })
      await expect(
        page.getByRole('heading', { name, exact: true }),
        'An unregistered name must offer registration, not a V1 renewal',
      ).toBeVisible()
      await expect(
        page.getByText('Registering for', { exact: true }),
      ).toBeVisible()
      await expect(
        page.getByRole('button', {
          name: id === 'L067' ? 'Connect to register' : 'Pay with stablecoins',
          exact: true,
        }),
      ).toBeVisible()
    } finally {
      if (id === 'L067') await page.close()
    }
  })
}
