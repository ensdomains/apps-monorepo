import { privateKeyToAccount } from 'viem/accounts'
import { createMakeV1Name } from '../../../fixtures/makeV1Name.js'
import { makeV1Subname } from '../../../fixtures/makeV1Subname.js'
import {
  connectWithHeadlessWallet,
  expect,
  test,
} from '../../../fixtures/playwright.portal.fixture.js'
import { setV1RecordsOn } from '../../../fixtures/v1-records.js'
import { waitForBignameBlock } from '../../../helpers/bigname-sync.js'

for (const scenario of [
  { id: 'L191', parentOnly: true, emancipated: false },
  { id: 'L192', parentOnly: false, emancipated: false },
  { id: 'L197', parentOnly: true, emancipated: true },
  { id: 'L198', parentOnly: false, emancipated: true },
]) {
  test(`${scenario.id} V1 ${scenario.emancipated ? 'emancipated' : 'parent-controlled'} child actions for ${scenario.parentOnly ? 'parent' : 'child'} owner`, async ({
    portalPage: page,
    wallet,
    accounts,
  }) => {
    test.setTimeout(120_000)
    const parentAccount = privateKeyToAccount(
      accounts.getPrivateKey(scenario.parentOnly ? 'user' : 'user2'),
    )
    const childAccount = privateKeyToAccount(
      accounts.getPrivateKey(scenario.parentOnly ? 'user2' : 'user'),
    )
    const parent = await createMakeV1Name({ userAccount: parentAccount })({
      label: scenario.id.toLowerCase(),
      type: scenario.emancipated ? 'locked' : 'wrapped',
    })
    const name = await makeV1Subname({
      parentName: parent.replace(/\.eth$/, ''),
      childLabel: 'test',
      ownerAddress: childAccount.address,
      parentOwnerAccount: parentAccount,
      fuses: scenario.emancipated ? 65537 : 0,
    })
    // The legacy fixture assigns a resolver even when no profile records are supplied.
    await setV1RecordsOn(name, childAccount, true, {})
    await waitForBignameBlock()
    await connectWithHeadlessWallet(page, wallet)
    await page.goto(`/${parent}/subnames`)
    const row = page.locator('table').getByRole('row').filter({ hasText: name })
    await expect(row).toBeVisible()
    const remove = row.getByRole('button', {
      name: `Delete ${name}`,
      exact: true,
    })
    const parentCannotControl = scenario.parentOnly && scenario.emancipated
    if (parentCannotControl) await expect.soft(remove).toHaveCount(0)
    else await expect.soft(remove).toBeVisible()
    await page.goto(`/${name}/subnames`)
    await expect(page.getByRole('heading', { name: /Subnames/ })).toBeVisible()
    await expect(page.getByText('Loading subnames...')).toHaveCount(0)
    const create = page.getByRole('link', {
      name: 'Create subname',
      exact: true,
    })
    if (scenario.parentOnly) await expect.soft(create).toHaveCount(0)
    else await expect.soft(create).toBeVisible()
    await page.goto(`/${name}/resolver`)
    await expect(
      page.getByRole('heading', { name: /Resolver/ }).first(),
    ).toBeVisible()
    const resolver = page.getByRole('link', {
      name: /Change resolver$/,
    })
    if (scenario.parentOnly) await expect.soft(resolver).toHaveCount(0)
    else await expect.soft(resolver).toBeVisible()
    if (scenario.id !== 'L198') {
      await page.goto(`/${name}/ownership`)
      await expect(page.getByText('Owner', { exact: true })).toBeVisible()
      const transfer = page.getByRole('link', { name: 'Transfer', exact: true })
      if (parentCannotControl) await expect.soft(transfer).toHaveCount(0)
      else await expect.soft(transfer).toBeVisible()
    }
  })
}
