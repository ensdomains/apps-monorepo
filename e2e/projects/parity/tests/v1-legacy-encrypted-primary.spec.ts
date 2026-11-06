import { concat, keccak256, labelhash, namehash, parseAbi } from 'viem'
import { V1_PUBLIC_RESOLVER } from '../../../fixtures/makeV1Name.js'
import {
  expect,
  MANAGER_APP_URL,
  PORTAL_APP_URL,
  test,
} from '../../../fixtures/playwright.cross-app.fixture.js'
import { publicClient } from '../../../helpers/anvil-client.js'
import { waitForBignameBlock } from '../../../helpers/bigname-sync.js'
import { readPrimaryName } from '../../../helpers/primary-name.js'
import { driveTransactionsToSuccess } from '../../../helpers/transaction-modal.js'
import { seedLegacyTree } from '../helpers/legacy-tree.js'

test('L270 set primary name starting from an encrypted legacy label', async ({
  explorer,
  manager,
  accounts,
}, info) => {
  const label = `unknown-label-${Date.now()}`,
    user = accounts.getAddress('user')
  const { name, root } = await seedLegacyTree(
    { label: 'l270', type: 'legacy', subnames: [{ label, owner: 'user' }] },
    'L270',
    accounts,
  )
  const encrypted = `[${labelhash(label).slice(2)}].${root}`,
    page = explorer.page
  await waitForBignameBlock()
  await page.goto(`${PORTAL_APP_URL}/${encrypted}/ownership`)
  await expect(page.locator('main')).toContainText(root)
  await page.goto(`${PORTAL_APP_URL}/${encrypted}/edit-records`)
  await expect(page.locator('main')).toBeVisible()
  await page.waitForLoadState('networkidle')
  await info.attach('hashed-label-editor', {
    body: await page.locator('main').innerText(),
    contentType: 'text/plain',
  })
  if (!(await page.getByLabel('Type', { exact: true }).count())) {
    expect(keccak256(concat([namehash(root), labelhash(label)]))).toBe(
      namehash(name),
    )
    await page.goto(`${PORTAL_APP_URL}/${name}/edit-records`)
    await info.attach('plaintext-recovery', {
      body: 'Supply the known plaintext label by opening the matching plaintext name. The computed node matches the hashed-label identifier. Continue ETH and reverse settings on this same name.',
      contentType: 'text/plain',
    })
  }
  await page.getByLabel('Type', { exact: true }).selectOption('address')
  await page.locator('button[role="combobox"]').click()
  await page.getByPlaceholder('Search coins...').fill('ETH')
  await page
    .getByRole('button', { name: /^ETH\b/i })
    .first()
    .click()
  await page.getByLabel('Value', { exact: true }).fill(user)
  await page.getByRole('button', { name: 'Add record', exact: true }).click()
  await page.getByRole('button', { name: /^Save \d+ changes?$/ }).click()
  await driveTransactionsToSuccess(page, explorer.wallet, [
    'tx-save-resolver-records',
  ])
  expect(
    (
      await publicClient.readContract({
        address: V1_PUBLIC_RESOLVER,
        abi: parseAbi(['function addr(bytes32) view returns(address)']),
        functionName: 'addr',
        args: [namehash(name)],
      })
    ).toLowerCase(),
  ).toBe(user.toLowerCase())
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
  await manager.page.goto(`${MANAGER_APP_URL}/dashboard`)
  await expect(
    manager.page.getByRole('link', { name: /^Go to profile/i }),
  ).toHaveAttribute('href', `/${name}`)
  await info.attach('encrypted-label-workaround', {
    body: 'The hashed-label Explorer editor rejects the bracketed label. Open the known plaintext form of the same name, set ETH in Edit records; then type the known plaintext name in address Reverse resolution → Mainnet. Manager reads the resulting primary name. This replaces the old label-recovery wizard.',
    contentType: 'text/plain',
  })
})
