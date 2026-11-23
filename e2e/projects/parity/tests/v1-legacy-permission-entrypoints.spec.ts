import {
  expect,
  MANAGER_APP_URL,
  PORTAL_APP_URL,
  test,
} from '../../../fixtures/playwright.cross-app.fixture.js'
import { waitForBignameBlock } from '../../../helpers/bigname-sync.js'
import { seedLegacyTree } from '../helpers/legacy-tree.js'

for (const id of ['L229', 'L230']) {
  test(`${id} split owner and manager record-edit authority`, async ({
    explorer,
    accounts,
  }) => {
    const { name } = await seedLegacyTree(
      {
        label: id,
        type: 'legacy',
        owner: id === 'L229' ? 'user2' : 'user',
        manager: id === 'L229' ? 'user' : 'user2',
      },
      id,
      accounts,
    )
    await waitForBignameBlock()
    await explorer.page.goto(`${PORTAL_APP_URL}/${name}/records`)
    await expect(
      explorer.page.locator('main').getByRole('heading', { level: 1 }),
    ).toBeVisible()
    const edit = explorer.page.getByRole('link', { name: /Edit records$/ })
    if (id === 'L229') {
      await expect(edit).toBeVisible()
      await edit.click()
      await expect(
        explorer.page.getByLabel('Type', { exact: true }),
      ).toBeVisible()
    } else {
      await expect(edit).toHaveCount(0)
      await explorer.page.goto(`${PORTAL_APP_URL}/${name}/edit-records`)
      await expect(explorer.page.locator('main')).toContainText(
        /not authorized|not authorised|permission|cannot edit/i,
      )
      await expect(
        explorer.page.getByLabel('Type', { exact: true }),
      ).toHaveCount(0)
    }
  })
}
for (const id of ['L189', 'L193', 'L194']) {
  test(`${id} V1 parent-controlled fuse workflow`, async ({
    explorer,
    manager,
    accounts,
  }, info) => {
    const { name, root } = await seedLegacyTree(
      {
        label: id,
        type: 'wrapped',
        fuses: id === 'L189' ? undefined : { named: ['CANNOT_UNWRAP'] },
        subnames: [{ label: 'test', owner: id === 'L189' ? 'user' : 'user2' }],
      },
      id,
      accounts,
    )
    await waitForBignameBlock()
    await explorer.page.goto(`${PORTAL_APP_URL}/${name}/fuses`)
    const label = id === 'L193' ? 'Can Extend Expiry' : 'Parent Cannot Control'
    await expect(
      explorer.page
        .getByRole('row')
        .filter({ has: explorer.page.getByText(label, { exact: true }) }),
    ).toContainText('False')
    await info.attach('explorer-fuses', {
      body: await explorer.page.locator('main').innerText(),
      contentType: 'text/plain',
    })
    await manager.page.goto(`${MANAGER_APP_URL}/${name}`)
    await expect(manager.page.locator('main')).toBeVisible()
    await manager.page.waitForLoadState('networkidle')
    await info.attach('manager-profile', {
      body: await manager.page.locator('main').innerText(),
      contentType: 'text/plain',
    })
    if (id === 'L189') {
      const warning = explorer.page.getByRole('link', {
        name: /parent.*(not locked|lock)|lock.*parent/i,
      })
      await expect(
        warning,
        'Child must explain the unlocked-parent prerequisite and link to its fuse page',
      ).toBeVisible()
      await warning.click()
      await expect(explorer.page).toHaveURL(
        new RegExp(`/${root.replaceAll('.', '\\.')}/fuses`),
      )
    } else {
      await explorer.page.goto(`${PORTAL_APP_URL}/${name}/fuses/burn`)
      const input = explorer.page
        .getByText(label, { exact: true })
        .locator('..')
        .getByRole('checkbox')
      await expect(
        input,
        `Parent must be able to burn ${label}; owner-only fuse controls are insufficient`,
      ).toBeVisible()
      throw new Error(
        'Parent fuse control discovered: complete transaction oracle before certifying parity',
      )
    }
  })
}
