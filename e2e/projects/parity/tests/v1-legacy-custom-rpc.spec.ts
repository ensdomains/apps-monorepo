import {
  expect,
  MANAGER_APP_URL,
  PORTAL_APP_URL,
  test,
} from '../../../fixtures/playwright.cross-app.fixture.js'

test('L280 custom RPC validates, probes, persists and resets in replacement settings', async ({
  explorer,
  manager,
}, info) => {
  let found = false
  await explorer.page.goto(PORTAL_APP_URL)
  await explorer.page
    .getByRole('button', { name: 'Settings', exact: true })
    .click()
  await expect(explorer.page.getByRole('menu')).toBeVisible()
  await info.attach('explorer-settings', {
    body: await explorer.page.getByRole('menu').innerText(),
    contentType: 'text/plain',
  })
  for (const [label, page, url] of [
    ['Explorer', explorer.page, PORTAL_APP_URL],
    ['Manager', manager.page, `${MANAGER_APP_URL}/dashboard`],
  ] as const) {
    if (label === 'Manager') await page.goto(url)
    await page.waitForLoadState('networkidle')
    found ||=
      (await page.getByRole('textbox', { name: /RPC|endpoint/i }).count()) > 0
    await info.attach(`${label}-available-controls`, {
      body: JSON.stringify(
        await page.locator('button,a,input').evaluateAll((els) =>
          els.map((e) => ({
            text: e.textContent,
            aria: e.getAttribute('aria-label'),
            href: e.getAttribute('href'),
            placeholder: e.getAttribute('placeholder'),
          })),
        ),
      ),
      contentType: 'application/json',
    })
  }
  expect(
    found,
    'Neither the Explorer settings menu nor Manager exposes a custom RPC editor. Validation, liveness probe, reset and persisted reload cannot be exercised; no verified UI workaround.',
  ).toBe(true)
  throw new Error(
    'RPC input discovered: execute validation/probe/reset/persistence assertions before certification',
  )
})
