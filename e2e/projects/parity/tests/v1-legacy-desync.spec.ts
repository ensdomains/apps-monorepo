import {
  encodeFunctionData,
  labelhash,
  namehash,
  parseAbi,
  zeroAddress,
} from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import {
  createMakeV1Name,
  reserveInV2,
  V1_BASE_REGISTRAR,
  V1_NAME_WRAPPER,
} from '../../../fixtures/makeV1Name.js'
import {
  expect,
  MANAGER_APP_URL,
  PORTAL_APP_URL,
  test,
} from '../../../fixtures/playwright.cross-app.fixture.js'
import { APP_V1_CONTROLLER } from '../../../fixtures/v1-controller-auth.js'
import {
  publicClient,
  testClient,
  walletClient,
} from '../../../helpers/anvil-client.js'
import { waitForBignameBlock } from '../../../helpers/bigname-sync.js'

for (const id of ['L050', 'L051', 'L052', 'L053', 'L054', 'L055']) {
  test(`${id} desynchronized wrapper repair entry points`, async ({
    explorer,
    manager,
    accounts,
  }, info) => {
    test.setTimeout(150_000)
    const account = privateKeyToAccount(accounts.getPrivateKey('user'))
    const name = await createMakeV1Name({ userAccount: account })({
      label: id.toLowerCase(),
      type: 'wrapped',
      reserveInV2: false,
      duration: 28 * 86400,
    })
    const label = name.split('.')[0],
      token = BigInt(labelhash(label)),
      node = BigInt(namehash(name)),
      grace = ['L052', 'L054'].includes(id)
    const wrapperAbi = parseAbi([
      'function getData(uint256) view returns(address,uint32,uint64)',
    ])
    const before = await publicClient.readContract({
      address: V1_NAME_WRAPPER,
      abi: wrapperAbi,
      functionName: 'getData',
      args: [node],
    })
    await testClient.impersonateAccount({ address: APP_V1_CONTROLLER })
    await testClient.setBalance({
      address: APP_V1_CONTROLLER,
      value: 10n ** 19n,
    })
    try {
      const hash = await walletClient.sendTransaction({
        account: APP_V1_CONTROLLER,
        to: V1_BASE_REGISTRAR,
        data: encodeFunctionData({
          abi: parseAbi(['function renew(uint256,uint256) returns(uint256)']),
          functionName: 'renew',
          args: [token, BigInt(grace ? 30 : 365) * 86400n],
        }),
      })
      expect(
        (await publicClient.waitForTransactionReceipt({ hash })).status,
      ).toBe('success')
    } finally {
      await testClient.stopImpersonatingAccount({ address: APP_V1_CONTROLLER })
    }
    const expiry = await publicClient.readContract({
      address: V1_BASE_REGISTRAR,
      abi: parseAbi(['function nameExpires(uint256) view returns(uint256)']),
      functionName: 'nameExpires',
      args: [token],
    })
    await reserveInV2(label, expiry)
    await testClient.setNextBlockTimestamp({ timestamp: before[2] + 86400n })
    await testClient.mine({ blocks: 1 })
    const after = await publicClient.readContract({
      address: V1_NAME_WRAPPER,
      abi: wrapperAbi,
      functionName: 'getData',
      args: [node],
    })
    expect(after[0]).toBe(zeroAddress)
    expect(after[2]).toBe(before[2])
    expect(expiry + 90n * 86400n).toBeGreaterThan(before[2] + 86400n)
    await waitForBignameBlock()
    let offered = false
    for (const [surface, page, url] of [
      ['Explorer', explorer.page, `${PORTAL_APP_URL}/${name}`],
      ['Manager', manager.page, `${MANAGER_APP_URL}/${name}`],
    ] as const) {
      await page.goto(
        `${url}${id === 'L050' ? '?referrer=0x1234567890123456789012345678901234567890' : ''}`,
      )
      await expect(page.locator('main')).toBeVisible()
      await page.waitForLoadState('networkidle')
      await info.attach(`${surface}-desync`, {
        body: await page.locator('main').innerText(),
        contentType: 'text/plain',
      })
      offered ||=
        (await page
          .getByRole('button', { name: /^Repair( name)?$/i })
          .or(page.getByRole('link', { name: /^Repair( name)?$/i }))
          .count()) > 0
    }
    await manager.page.goto(`${MANAGER_APP_URL}/renew-v1/${name}`)
    await expect(manager.page.locator('main')).toBeVisible()
    await manager.page.waitForLoadState('networkidle')
    await info.attach('dedicated-renewal-recovery', {
      body: await manager.page.locator('main').innerText(),
      contentType: 'text/plain',
    })
    expect(
      offered,
      'Expired wrapper token with renewed registrar has no Repair entry point. Renewal route inspected separately; ownership restoration and referral not yet verified.',
    ).toBe(true)
    throw new Error(
      'Repair action available: execute original repair and check wrapper restoration before certifying parity',
    )
  })
}
