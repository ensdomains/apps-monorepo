import { namehash, parseAbi } from 'viem'
import {
  V1_ENS_REGISTRY,
  V1_PUBLIC_RESOLVER,
} from '../../../fixtures/makeV1Name.js'
import {
  expect,
  MANAGER_APP_URL,
  PORTAL_APP_URL,
  test,
} from '../../../fixtures/playwright.cross-app.fixture.js'
import { publicClient } from '../../../helpers/anvil-client.js'
import { waitForBignameBlock } from '../../../helpers/bigname-sync.js'
import { driveTransactionsToSuccess } from '../../../helpers/transaction-modal.js'
import { type LegacyName, seedLegacyTree } from '../helpers/legacy-tree.js'
import cases from '../ownership-cases.json' with { type: 'json' }

for (const c of cases.filter((c) =>
  ['L094', 'L174', 'L175', 'L176'].includes(c.id),
)) {
  test(`${c.id} ${c.title}`, async ({ explorer, manager, accounts }, info) => {
    const { name } = await seedLegacyTree(
      c.config as LegacyName,
      c.id,
      accounts,
    )
    await waitForBignameBlock()
    let found = false
    for (const [surface, page, url] of [
      ['Explorer', explorer.page, `${PORTAL_APP_URL}/${name}/ownership`],
      ['Manager', manager.page, `${MANAGER_APP_URL}/${name}`],
    ] as const) {
      await page.goto(url)
      await expect(page.locator('main')).toBeVisible()
      await page.waitForLoadState('networkidle')
      found ||=
        (await page
          .getByRole('button', {
            name: /Edit roles|Change manager|Change owner/i,
          })
          .or(
            page.getByRole('link', {
              name: /Edit roles|Change manager|Change owner/i,
            }),
          )
          .count()) > 0
      await info.attach(surface, {
        body: await page.locator('main').innerText(),
        contentType: 'text/plain',
      })
    }
    expect(
      found,
      'Independent registrant/controller edit missing. Reclaim changes manager to self; Transfer moves both roles. Neither completes the requested single-role change.',
    ).toBe(true)
    throw new Error(
      'Independent role editor discovered: execute the original selected-role change and assert unselected roles remain unchanged',
    )
  })
}
for (const c of cases.filter((c) => ['L101', 'L105'].includes(c.id))) {
  test(`${c.id} edit only the ETH record while a V1 name is in grace`, async ({
    explorer,
    accounts,
  }, info) => {
    const { name } = await seedLegacyTree(
      c.config as LegacyName,
      c.id,
      accounts,
    )
    await waitForBignameBlock()
    const page = explorer.page,
      node = namehash(name)
    const registryOwner = () =>
      publicClient.readContract({
        address: V1_ENS_REGISTRY,
        abi: parseAbi(['function owner(bytes32) view returns (address)']),
        functionName: 'owner',
        args: [node],
      })
    const before = await registryOwner(),
      recipient = accounts.getAddress('user3')
    await page.goto(`${PORTAL_APP_URL}/${name}/ownership`)
    await expect(page.locator('main')).toContainText(/grace/i)
    await expect(
      page.getByRole('link', { name: 'Transfer', exact: true }),
    ).toHaveCount(0)
    await page.goto(`${PORTAL_APP_URL}/${name}/edit-records`)
    await expect(page.getByLabel('Type', { exact: true })).toBeVisible()
    const row = page.getByRole('row').filter({ has: page.getByText(/^eth$/i) })
    if (await row.count()) {
      await row
        .getByRole('button', { name: 'Delete record', exact: true })
        .click()
      await page.getByRole('button', { name: 'Confirm', exact: true }).click()
    }
    await page.getByLabel('Type', { exact: true }).selectOption('address')
    await page.locator('button[role="combobox"]').click()
    await page.getByPlaceholder('Search coins...').fill('ETH')
    await page
      .getByRole('button', { name: /^ETH\b/i })
      .first()
      .click()
    await page.getByLabel('Value', { exact: true }).fill(recipient)
    await page.getByRole('button', { name: 'Add record', exact: true }).click()
    await page.getByRole('button', { name: /^Save \d+ changes?$/ }).click()
    await driveTransactionsToSuccess(page, explorer.wallet, [
      'tx-save-resolver-records',
    ])
    expect(await registryOwner()).toBe(before)
    expect(
      (
        await publicClient.readContract({
          address: V1_PUBLIC_RESOLVER,
          abi: parseAbi(['function addr(bytes32) view returns (address)']),
          functionName: 'addr',
          args: [node],
        })
      ).toLowerCase(),
    ).toBe(recipient.toLowerCase())
    await page.goto(`${PORTAL_APP_URL}/${name}/ownership`)
    await info.attach('after-grace-record-edit', {
      body: await page.locator('main').innerText(),
      contentType: 'text/plain',
    })
    const ownerRow = page
      .locator('main')
      .getByText('Previous owner', { exact: true })
      .locator('../..')
    await expect(
      ownerRow.locator(`a[href*="${accounts.getAddress('user')}" i]`),
      'Original previous-owner display must still identify the holder',
    ).toBeVisible()
  })
}
