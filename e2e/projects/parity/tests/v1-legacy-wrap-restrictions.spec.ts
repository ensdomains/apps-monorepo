import {
  expect,
  MANAGER_APP_URL,
  PORTAL_APP_URL,
  test,
} from '../../../fixtures/playwright.cross-app.fixture.js'
import { waitForBignameBlock } from '../../../helpers/bigname-sync.js'
import { type LegacyName, seedLegacyTree } from '../helpers/legacy-tree.js'
import cases from '../wrap-cases.json' with { type: 'json' }

for (const c of cases.filter((c) =>
  ['L287', 'L295', 'L298', 'L302'].includes(c.id),
)) {
  test(`${c.id} ${c.title}`, async ({ explorer, manager, accounts }, info) => {
    const { name } = await seedLegacyTree(
      c.config as LegacyName,
      c.id,
      accounts,
    )
    await waitForBignameBlock()
    await explorer.page.goto(`${PORTAL_APP_URL}/${name}/fuses`)
    await expect(
      explorer.page.locator('main').getByRole('heading', { level: 1 }),
    ).toBeVisible()
    if (c.id !== 'L302') {
      await expect(
        explorer.page.getByRole('row').filter({
          has: explorer.page.getByText('Parent Cannot Control', {
            exact: true,
          }),
        }),
      ).toContainText('True')
      await expect(
        explorer.page.getByRole('row').filter({
          has: explorer.page.getByText('Cannot Unwrap', { exact: true }),
        }),
      ).toContainText(c.id === 'L287' ? 'False' : 'True')
    } else await expect(explorer.page.locator('main')).toContainText(/grace/i)
    const action =
      c.id === 'L287' ? /^(Wrap|Wrap name)$/i : /^(Unwrap|Unwrap name)$/i
    for (const [surface, page, url] of [
      ['Explorer', explorer.page, `${PORTAL_APP_URL}/${name}/ownership`],
      ['Manager', manager.page, `${MANAGER_APP_URL}/${name}`],
    ] as const) {
      await page.goto(url)
      await expect(page.locator('main')).toBeVisible()
      await page.waitForLoadState('networkidle')
      const matches = page
        .getByRole('button', { name: action })
        .or(page.getByRole('link', { name: action }))
      for (const control of await matches.all())
        await expect(control).toBeDisabled()
      await info.attach(surface, {
        body: await page.locator('main').innerText(),
        contentType: 'text/plain',
      })
    }
  })
}
