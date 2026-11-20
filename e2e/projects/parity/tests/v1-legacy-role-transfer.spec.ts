import { labelhash, namehash, parseAbi } from 'viem'
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
import cases from '../ownership-cases.json' with { type: 'json' }

for (const scenario of cases.filter((c) =>
  [
    'L173',
    'L178',
    'L179',
    'L182',
    'L183',
    'L185',
    'L186',
    'L188',
    'L177',
  ].includes(c.id),
)) {
  test(`${scenario.id} ${scenario.title}`, async ({
    portalPage: page,
    wallet,
    accounts,
  }, testInfo) => {
    test.setTimeout(150_000)
    const { name, wrapped, holder } = await seedLegacyTree(
      scenario.config as LegacyName,
      scenario.id,
      accounts,
    )
    await waitForBignameBlock()
    await connectWithHeadlessWallet(page, wallet)
    await page.goto(`/${name}/ownership`)
    const resolver = () =>
      publicClient.readContract({
        address: V1_ENS_REGISTRY,
        abi: parseAbi(['function resolver(bytes32) view returns (address)']),
        functionName: 'resolver',
        args: [namehash(name)],
      })
    const oldResolver = await resolver()
    const reclaim = ['L173', 'L188'].includes(scenario.id)
    const recipient = accounts.getAddress(reclaim ? 'user' : 'user3')
    if (reclaim) {
      await page.getByRole('button', { name: /Reclaim manager$/ }).click()
      await driveTransactionsToSuccess(page, wallet, [
        `reclaim-manager-${name}`,
      ])
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
    } else {
      await page.getByRole('link', { name: 'Transfer', exact: true }).click()
      await page.getByPlaceholder('ENS name or address').fill(recipient)
      const detach = page.getByRole('switch', { name: /Detach the resolver/ })
      await expect(
        page.getByRole('button', { name: 'Transfer name', exact: true }),
      ).toBeEnabled()
      if ((await detach.isVisible()) && (await detach.isChecked()))
        await detach.uncheck()
      const eth = page.getByRole('switch', {
        name: /Set the ETH address to the recipient/,
      })
      if (
        (await eth.isVisible()) &&
        (await eth.isEnabled()) &&
        (await eth.isChecked())
      )
        await eth.uncheck()
      await page
        .getByRole('button', { name: 'Transfer name', exact: true })
        .click()
      const parentActs = holder !== 'user'
      const steps =
        scenario.id === 'L177'
          ? ['reclaim', 'transfer-erc721']
          : [
              parentActs
                ? 'set-subnode-owner'
                : wrapped
                  ? 'transfer-erc1155'
                  : 'set-registry-owner',
            ]
      await driveTransactionsToSuccess(
        page,
        wallet,
        steps.map((step) => `transfer-${name}-${step}`),
      )
    }
    const current = await publicClient.readContract({
      address: wrapped ? V1_NAME_WRAPPER : V1_ENS_REGISTRY,
      abi: parseAbi([
        'function owner(bytes32) view returns (address)',
        'function ownerOf(uint256) view returns (address)',
      ]),
      functionName: wrapped ? 'ownerOf' : 'owner',
      args: [wrapped ? BigInt(namehash(name)) : namehash(name)],
    } as never)
    expect(String(current).toLowerCase()).toBe(recipient.toLowerCase())
    expect(await resolver()).toBe(oldResolver)
    await waitForBignameBlock()
    await page.goto(`/${name}/ownership`)
    await expect(
      page.locator('main').locator(`a[href*="${recipient}" i]`).first(),
    ).toBeVisible()
    await testInfo.attach('workflow-adaptation', {
      body: reclaim
        ? 'Explorer Reclaim manager replaces Edit Roles → manager → self.'
        : 'Explorer Transfer with resolver kept and ETH update off replaces the selected ownership-role edit.',
      contentType: 'text/plain',
    })
  })
}
