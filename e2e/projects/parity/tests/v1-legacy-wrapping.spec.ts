import { labelhash, namehash, parseAbi } from 'viem'
import {
  V1_BASE_REGISTRAR,
  V1_NAME_WRAPPER,
} from '../../../fixtures/makeV1Name.js'
import {
  expect,
  MANAGER_APP_URL,
  PORTAL_APP_URL,
  test,
} from '../../../fixtures/playwright.cross-app.fixture.js'
import { publicClient, testClient } from '../../../helpers/anvil-client.js'
import { waitForBignameBlock } from '../../../helpers/bigname-sync.js'
import { type LegacyName, seedLegacyTree } from '../helpers/legacy-tree.js'
import cases from '../wrap-cases.json' with { type: 'json' }

// Missing actions fail at the first required step; later transaction assertions are not certified.
for (const scenario of cases.filter(
  (c) => !['L287', 'L295', 'L298', 'L302'].includes(c.id),
)) {
  test(`${scenario.id} ${scenario.title}`, async ({
    manager,
    explorer,
    accounts,
  }, info) => {
    test.setTimeout(120_000)
    const graceChild = ['L303', 'L304'].includes(scenario.id)
    const seeded = await seedLegacyTree(
      graceChild
        ? ({ ...scenario.config, duration: 28 * 86400 } as LegacyName)
        : (scenario.config as LegacyName),
      scenario.id,
      accounts,
    )
    if (graceChild) {
      const expiry = await publicClient.readContract({
        address: V1_BASE_REGISTRAR,
        abi: parseAbi(['function nameExpires(uint256) view returns(uint256)']),
        functionName: 'nameExpires',
        args: [BigInt(labelhash(seeded.root.split('.')[0]))],
      })
      await testClient.setNextBlockTimestamp({ timestamp: expiry + 86400n })
      await testClient.mine({ blocks: 1 })
      const child = await publicClient.readContract({
        address: V1_NAME_WRAPPER,
        abi: parseAbi([
          'function getData(uint256) view returns(address,uint32,uint64)',
        ]),
        functionName: 'getData',
        args: [BigInt(namehash(seeded.name))],
      })
      expect(child[0].toLowerCase()).toBe(
        accounts.getAddress('user').toLowerCase(),
      )
      expect(child[2]).toBeGreaterThan(expiry + 86400n)
    }
    const name =
      scenario.id === 'L292'
        ? `[${labelhash('unknown-parity-label').slice(2)}].${seeded.root}`
        : seeded.name
    await waitForBignameBlock()
    const action = seeded.wrapped
      ? /^(Unwrap|Unwrap name)$/i
      : /^(Wrap|Wrap name)$/i
    let actionFound = false
    for (const [surface, page, url] of [
      ['Explorer', explorer.page, `${PORTAL_APP_URL}/${name}/ownership`],
      ['Explorer fuses', explorer.page, `${PORTAL_APP_URL}/${name}/fuses`],
      ['Manager', manager.page, `${MANAGER_APP_URL}/${name}`],
    ] as const) {
      await page.goto(url)
      await expect(page.locator('main')).toBeVisible()
      await page.waitForLoadState('networkidle')
      const buttons = page
        .getByRole('button', { name: action })
        .or(page.getByRole('link', { name: action }))
      actionFound ||= (await buttons.count()) > 0
      await info.attach(`${surface}-controls`, {
        body: await page.locator('main').innerText(),
        contentType: 'text/plain',
      })
    }
    if (['L286', 'L300'].includes(scenario.id)) {
      expect(
        actionFound,
        'Wrapping must be unavailable to this actor/state',
      ).toBe(false)
    } else {
      expect(
        actionFound,
        `Required ${seeded.wrapped ? 'Unwrap' : 'Wrap'} entry point absent in Manager and Explorer; subsequent original steps cannot be executed`,
      ).toBe(true)
      // Guard against treating entry-point discovery as full transaction parity.
      throw new Error(
        'Wrap action became available: port and execute the remaining original transaction assertions before certifying this case',
      )
    }
  })
}
