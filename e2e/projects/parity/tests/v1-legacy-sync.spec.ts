import {
  connectWithHeadlessWallet,
  expect,
  test,
} from '../../../fixtures/playwright.portal.fixture.js'
import { waitForBignameBlock } from '../../../helpers/bigname-sync.js'
import { type LegacyName, seedLegacyTree } from '../helpers/legacy-tree.js'
import cases from '../ownership-cases.json' with { type: 'json' }

const ids = [
  'L108',
  'L112',
  'L116',
  'L120',
  'L124',
  'L128',
  'L132',
  'L138',
  'L142',
  'L146',
  'L150',
  'L156',
  'L160',
  'L135',
  'L153',
  'L165',
  'L180',
  'L181',
  'L184',
]
for (const scenario of cases.filter((c) => ids.includes(c.id))) {
  test(`${scenario.id} ${scenario.title}`, async ({
    portalPage: page,
    wallet,
    accounts,
  }, testInfo) => {
    test.setTimeout(120_000)
    const seeded = await seedLegacyTree(
      scenario.config as LegacyName,
      scenario.id,
      accounts,
    )
    await testInfo.attach('legacy-fixture', {
      body: JSON.stringify({ ...seeded, original: scenario.config }),
      contentType: 'application/json',
    })
    await waitForBignameBlock()
    await connectWithHeadlessWallet(page, wallet)
    await page.goto(`/${seeded.name}/ownership`)
    await expect(
      page.locator('main').getByRole('heading', { level: 1 }),
    ).toContainText('Ownership')
    await expect(page.getByText('Owner', { exact: true })).toBeVisible()
    if (scenario.title.endsWith('Sync Manager')) {
      await expect(
        page.getByRole('button', { name: /Reclaim manager$/ }),
      ).toHaveCount(0)
    } else {
      await expect(
        page.getByRole('link', { name: 'Transfer', exact: true }),
      ).toHaveCount(0)
      if (['L135', 'L153'].includes(scenario.id)) {
        await expect(
          page.getByRole('button', { name: /Reclaim manager$/ }),
        ).toHaveCount(0)
        await expect(
          page.getByRole('button', { name: /Edit roles/i }),
        ).toHaveCount(0)
      }
    }
  })
}
