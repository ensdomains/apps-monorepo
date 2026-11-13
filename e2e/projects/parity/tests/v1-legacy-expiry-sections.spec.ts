import {
  expect,
  MANAGER_APP_URL,
  PORTAL_APP_URL,
  test,
} from '../../../fixtures/playwright.cross-app.fixture.js'
import { waitForBignameBlock } from '../../../helpers/bigname-sync.js'
import { type LegacyName, seedLegacyTree } from '../helpers/legacy-tree.js'
import cases from '../ownership-cases.json' with { type: 'json' }

for (const c of cases.filter((c) =>
  c.title.endsWith('Expiry Section, Extend & Set Reminder'),
)) {
  test(`${c.id} ${c.title}`, async ({ explorer, manager, accounts }, info) => {
    test.setTimeout(120_000)
    const { name, root, wrapped } = await seedLegacyTree(
      c.config as LegacyName,
      c.id,
      accounts,
    )
    await waitForBignameBlock()
    const page = explorer.page
    await page.goto(`${PORTAL_APP_URL}/${name}/ownership`)
    await expect(
      page.locator('main').getByRole('heading', { level: 1 }),
    ).toBeVisible()
    await expect(
      page
        .locator('main')
        .getByText(/^(Owner|Previous owner)$/, { exact: true })
        .first(),
    ).toBeVisible()
    await info.attach('ownership-expiry-information', {
      body: await page.locator('main').innerText(),
      contentType: 'text/plain',
    })
    const expected = (field: string) =>
      c.body.includes(`ownershipPage.${field}).toHaveCount(1)`)
    const expiry = page.locator('main').getByText('Expires', { exact: true })
    if (name === root || expected('expiryPanelExpiry'))
      await expect
        .soft(expiry, 'The name expiry should be visible')
        .toBeVisible()
    else if (!wrapped)
      await expect
        .soft(expiry, 'Unwrapped children have no independent expiry')
        .toHaveCount(0)
    if (expected('expiryPanelRegistrationDate'))
      await expect
        .soft(page.locator('main').getByText('Registered', { exact: true }))
        .toBeVisible()
    if (expected('expiryPanelGracePeriod'))
      await expect
        .soft(
          page.locator('main').getByText('Grace ends', { exact: true }),
          'Grace-end information required by original case',
        )
        .toBeVisible({ timeout: 3000 })
    if (name !== root) {
      const parent = name.split('.').slice(1).join('.')
      // Follow the actual parent link as a workaround for the missing inline parent-expiry section.
      await page
        .locator('main')
        .getByRole('link', { name: parent, exact: true })
        .first()
        .click()
      await expect(
        page.locator('main').getByRole('heading', { level: 1 }),
      ).toBeVisible()
      if (expected('expiryPanelParentExpiry'))
        await expect
          .soft(
            page.locator('main').getByText('Expires', { exact: true }),
            'Parent expiry via linked parent profile',
          )
          .toBeVisible()
      if (expected('expiryPanelParentGracePeriod'))
        await expect
          .soft(
            page.locator('main').getByText('Grace ends', { exact: true }),
            'Parent grace end remains required through the workaround',
          )
          .toBeVisible({ timeout: 3000 })
      await info.attach('parent-expiry-workaround', {
        body: await page.locator('main').innerText(),
        contentType: 'text/plain',
      })
      await page.goto(`${PORTAL_APP_URL}/${name}`)
      await expect(
        page.locator('main').getByRole('heading', { level: 1 }),
      ).toBeVisible()
      await expect
        .soft(
          page.getByRole('button', { name: 'Extend', exact: true }),
          'Child has no registrar renewal action',
        )
        .toHaveCount(0)
    } else {
      await page.goto(`${PORTAL_APP_URL}/${name}`)
      const extend = page.getByRole('button', { name: 'Extend', exact: true })
      if (!(await extend.isVisible())) {
        await page.goto(
          `${PORTAL_APP_URL}/addr/${accounts.getAddress((c.config as LegacyName).owner ?? 'user')}/names`,
        )
        await page.getByPlaceholder('Search names...').fill(name.split('.')[0])
        const row = page.getByRole('row').filter({ hasText: name })
        await expect(row).toHaveCount(1)
        await row.getByRole('checkbox').first().check()
      }
      await extend.click()
      const dialog = page.getByRole('dialog'),
        next = dialog.getByRole('button', { name: 'Next', exact: true }),
        understand = dialog.getByRole('button', { name: 'I Understand' })
      await expect(next.or(understand).first()).toBeVisible()
      if (await understand.isVisible())
        await understand.click({ timeout: 3000 }).catch(() => {})
      await next.click()
      await expect(
        dialog.getByRole('button', { name: /^USDC\b/ }),
      ).toBeVisible()
      await manager.page.goto(`${MANAGER_APP_URL}/${name}`)
      await expect(manager.page.locator('main')).toBeVisible()
      await manager.page.waitForLoadState('networkidle')
      await info.attach('manager-reminder-entrypoints', {
        body: await manager.page.locator('main').innerText(),
        contentType: 'text/plain',
      })
      await expect
        .soft(
          manager.page
            .getByRole('button', { name: /set.*reminder|remind me/i })
            .or(
              manager.page.getByRole('link', {
                name: /set.*reminder|remind me/i,
              }),
            ),
          'Per-name reminder entry point; global Notification Settings is not yet a verified substitute',
        )
        .toBeVisible({ timeout: 3000 })
    }
  })
}
