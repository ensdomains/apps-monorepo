import { labelhash, parseAbi } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import {
  createMakeV1Name,
  V1_BASE_REGISTRAR,
} from '../../../fixtures/makeV1Name.js'
import {
  connectWithHeadlessWallet,
  expect,
  test,
} from '../../../fixtures/playwright.portal.fixture.js'
import { splitController, splitRegistrant } from '../../../fixtures/v1-tails.js'
import { publicClient, testClient } from '../../../helpers/anvil-client.js'
import { waitForBignameBlock } from '../../../helpers/bigname-sync.js'

const cases = [
  {
    id: 'L093',
    type: 'unwrapped',
    split: 'registrant',
    grace: false,
    action: 'Transfer',
  },
  {
    id: 'L099',
    type: 'unwrapped',
    split: 'none',
    grace: true,
    action: 'Transfer',
  },
  {
    id: 'L100',
    type: 'unwrapped',
    split: 'controller',
    grace: true,
    action: 'Reclaim manager',
  },
  {
    id: 'L103',
    type: 'wrapped',
    split: 'none',
    grace: true,
    action: 'Transfer',
  },
  {
    id: 'L104',
    type: 'wrapped',
    split: 'none',
    grace: true,
    action: 'Reclaim manager',
  },
] as const

for (const scenario of cases) {
  test(`${scenario.id} V1 ${scenario.type} ${scenario.grace ? 'one day into grace' : 'manager only'} hides ${scenario.action}`, async ({
    portalPage: page,
    wallet,
    accounts,
  }) => {
    test.setTimeout(120_000)
    const account = privateKeyToAccount(accounts.getPrivateKey('user'))
    const name = await createMakeV1Name({ userAccount: account })({
      label: scenario.id.toLowerCase(),
      type: scenario.type,
      duration: scenario.grace ? 28 * 86400 : undefined,
      records: {
        addresses: [
          { coinType: 61, value: '0x42D63ae25990889E35F215bC95884039Ba354115' },
        ],
      },
    })
    if (scenario.split === 'registrant')
      await splitRegistrant(name, account, accounts.getAddress('user2'))
    if (scenario.split === 'controller')
      await splitController(name, account, accounts.getAddress('user2'))
    if (scenario.grace) {
      const expiry = await publicClient.readContract({
        address: V1_BASE_REGISTRAR,
        abi: parseAbi(['function nameExpires(uint256) view returns (uint256)']),
        functionName: 'nameExpires',
        args: [BigInt(labelhash(name.split('.')[0]))],
      })
      await testClient.setNextBlockTimestamp({ timestamp: expiry + 86400n })
      await testClient.mine({ blocks: 1 })
    }
    await waitForBignameBlock()
    await connectWithHeadlessWallet(page, wallet)
    await page.goto(`/${name}/ownership`)
    // Wait for loaded ownership data before making a negative assertion.
    await expect(
      page.getByText(scenario.grace ? 'Previous owner' : 'Owner', {
        exact: true,
      }),
    ).toBeVisible()
    await expect(page.getByText('Expires', { exact: true })).toBeVisible()
    if (scenario.action === 'Transfer') {
      await expect(
        page.getByRole('link', { name: 'Transfer', exact: true }),
      ).toHaveCount(0)
    } else {
      await expect(
        page.getByRole('button', { name: /Reclaim manager$/ }),
      ).toHaveCount(0)
    }
  })
}
