import { privateKeyToAccount } from 'viem/accounts'
import { createMakeV1Name } from '../../../fixtures/makeV1Name.js'
import {
  expect,
  MANAGER_APP_URL,
  PORTAL_APP_URL,
  test,
} from '../../../fixtures/playwright.cross-app.fixture.js'
import {
  bignameName,
  waitForBignameBlock,
} from '../../../helpers/bigname-sync.js'
import {
  openPrimaryNamePicker,
  readPrimaryName,
} from '../../../helpers/primary-name.js'
import { driveTransactionsToSuccess } from '../../../helpers/transaction-modal.js'

for (const type of ['unwrapped', 'wrapped'] as const) {
  test(`REG-05 ${type} V1 primary name can be set in Explorer and read in Manager`, async ({
    explorer,
    manager,
    accounts,
  }, testInfo) => {
    test.setTimeout(180_000)
    const account = privateKeyToAccount(accounts.getPrivateKey('user'))
    const name = await createMakeV1Name({ userAccount: account })({
      label: `v1-primary-${type}`,
      type,
      records: { addresses: [{ coinType: 60, value: account.address }] },
    })
    await waitForBignameBlock()
    const picker = await openPrimaryNamePicker(manager.page, account.address)
    await picker.getByPlaceholder('Search names').fill(name)
    const candidate = picker.getByRole('button', {
      name: `Select ${name} as primary name`,
      exact: true,
    })
    await expect(
      candidate.or(picker.getByText('No names found', { exact: true })),
    ).toBeVisible()
    const managerOffersCandidate = await candidate.isVisible()
    await testInfo.attach('manager-v1-primary-candidate', {
      body: JSON.stringify({ name, managerOffersCandidate }),
      contentType: 'application/json',
    })
    console.log(
      `[REG-05] Manager offers ${type} V1 candidate: ${managerOffersCandidate}`,
    )

    await explorer.page.goto(
      `${PORTAL_APP_URL}/addr/${account.address}/reverse-resolution`,
    )
    const mainnet = explorer.page
      .getByRole('row')
      .filter({ has: explorer.page.getByText('Mainnet', { exact: true }) })
    await mainnet.getByRole('button', { name: 'More', exact: true }).click()
    const sidebar = explorer.page.getByRole('dialog', {
      name: 'Mainnet resolution',
    })
    await sidebar.locator('input[name="name"]').fill(name)
    await sidebar.getByRole('button', { name: 'Update', exact: true }).click()
    await driveTransactionsToSuccess(explorer.page, explorer.wallet, [
      'tx-update-reverse-name',
    ])
    await expect
      .poll(() => readPrimaryName(account.address), { timeout: 30_000 })
      .toBe(name)
    await waitForBignameBlock()
    await manager.page.goto(`${MANAGER_APP_URL}/dashboard`)
    await expect(
      manager.page.getByRole('link', { name: /^Go to profile/i }),
    ).toHaveAttribute('href', `/${name}`)
    expect((await bignameName(name))?.authority).toBe('ens_v1')
  })
}
