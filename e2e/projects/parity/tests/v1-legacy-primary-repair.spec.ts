import { namehash, parseAbi } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import {
  createMakeV1Name,
  V1_ENS_REGISTRY,
} from '../../../fixtures/makeV1Name.js'
import {
  expect,
  MANAGER_APP_URL,
  PORTAL_APP_URL,
  test,
} from '../../../fixtures/playwright.cross-app.fixture.js'
import { splitController } from '../../../fixtures/v1-tails.js'
import { publicClient } from '../../../helpers/anvil-client.js'
import { waitForBignameBlock } from '../../../helpers/bigname-sync.js'
import {
  openPrimaryNamePicker,
  readPrimaryName,
} from '../../../helpers/primary-name.js'
import { driveTransactionsToSuccess } from '../../../helpers/transaction-modal.js'

for (const id of ['L264', 'L265', 'L279']) {
  test(`${id} V1 primary name through Explorer reverse settings and forward-record repair`, async ({
    explorer,
    manager,
    accounts,
  }, info) => {
    test.setTimeout(180_000)
    const owner = privateKeyToAccount(
      accounts.getPrivateKey(id === 'L279' ? 'user' : 'user2'),
    )
    const user = accounts.getAddress('user'),
      wrong = accounts.getAddress('user2')
    const name = await createMakeV1Name({ userAccount: owner })({
      label: id.toLowerCase(),
      type: id === 'L279' ? 'wrapped' : 'unwrapped',
      records: {
        addresses: [
          {
            coinType: 60,
            value:
              id === 'L279'
                ? '0x0000000000000000000000000000000000000000'
                : id === 'L265'
                  ? wrong
                  : user,
          },
        ],
      },
    })
    if (id === 'L265') await splitController(name, owner, user)
    const another =
      id === 'L264'
        ? await createMakeV1Name({
            userAccount: privateKeyToAccount(accounts.getPrivateKey('user')),
          })({
            label: 'l264-other',
            type: 'unwrapped',
            records: { addresses: [{ coinType: 60, value: user }] },
          })
        : undefined
    await waitForBignameBlock()
    const page = explorer.page
    if (id === 'L265' || id === 'L279') {
      await page.goto(`${PORTAL_APP_URL}/${name}/edit-records`)
      const row = page
        .getByRole('row')
        .filter({ has: page.getByText(/^eth$/i) })
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
      await page.getByLabel('Value', { exact: true }).fill(user)
      await page
        .getByRole('button', { name: 'Add record', exact: true })
        .click()
      await page.getByRole('button', { name: /^Save \d+ changes?$/ }).click()
      await driveTransactionsToSuccess(page, explorer.wallet, [
        'tx-save-resolver-records',
      ])
    }
    await page.goto(`${PORTAL_APP_URL}/addr/${user}/reverse-resolution`)
    await page
      .getByRole('row')
      .filter({ has: page.getByText('Mainnet', { exact: true }) })
      .getByRole('button', { name: 'More', exact: true })
      .click()
    const sheet = page.getByRole('dialog', { name: 'Mainnet resolution' })
    await sheet.locator('input[name="name"]').fill(name)
    await sheet.getByRole('button', { name: 'Update', exact: true }).click()
    await driveTransactionsToSuccess(page, explorer.wallet, [
      'tx-update-reverse-name',
    ])
    await expect.poll(() => readPrimaryName(user)).toBe(name)
    const resolver = await publicClient.readContract({
      address: V1_ENS_REGISTRY,
      abi: parseAbi(['function resolver(bytes32) view returns (address)']),
      functionName: 'resolver',
      args: [namehash(name)],
    })
    expect(
      (
        await publicClient.readContract({
          address: resolver,
          abi: parseAbi(['function addr(bytes32) view returns (address)']),
          functionName: 'addr',
          args: [namehash(name)],
        })
      ).toLowerCase(),
    ).toBe(user.toLowerCase())
    await manager.page.goto(`${MANAGER_APP_URL}/dashboard`)
    await expect(
      manager.page.getByRole('link', { name: /^Go to profile/i }),
    ).toHaveAttribute('href', `/${name}`)
    await info.attach('primary-workaround', {
      body: 'Use Explorer address → Reverse resolution → Mainnet. When the forward record differs, first update ETH in Explorer Edit records as the current manager. Verify primary in Manager.',
      contentType: 'text/plain',
    })
    if (another) {
      const picker = await openPrimaryNamePicker(manager.page, user)
      await picker.getByPlaceholder('Search names').fill(name)
      await expect(
        picker.getByText('No names found', { exact: true }),
      ).toBeVisible()
      await picker.getByPlaceholder('Search names').fill(another)
      await expect(
        picker.getByRole('button', {
          name: `Select ${another} as primary name`,
          exact: true,
        }),
        'Original owned V1 alternative must be selectable; primary-setting success alone does not certify the picker',
      ).toBeVisible()
    }
  })
}
