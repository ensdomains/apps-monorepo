import { namehash } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { createMakeV1Name } from '../../../fixtures/makeV1Name.js'
import {
  expect,
  MANAGER_APP_URL,
  PORTAL_APP_URL,
  test,
} from '../../../fixtures/playwright.cross-app.fixture.js'
import { RESOLVER_ABI } from '../../../fixtures/v1-records.js'
import { publicClient } from '../../../helpers/anvil-client.js'
import { waitForBignameBlock } from '../../../helpers/bigname-sync.js'
import { driveTransactionsToSuccess } from '../../../helpers/transaction-modal.js'
import {
  defaults,
  profileResolver,
  seedProfileRecords as setV1RecordsOn,
} from '../helpers/profile-records.js'

for (const id of ['L199', 'L200']) {
  test(`${id} legacy profile records remain visible${id === 'L200' ? ' with an unknown tab query' : ''}`, async ({
    manager,
    explorer,
    accounts,
  }, info) => {
    const account = privateKeyToAccount(accounts.getPrivateKey('user')),
      resolver = await profileResolver('legacy', account)
    const name = await createMakeV1Name({ userAccount: account })({
      label: id.toLowerCase(),
      type: 'unwrapped',
    })
    await setV1RecordsOn(name, account, false, defaults(account.address), {
      resolver,
    })
    await waitForBignameBlock()
    await manager.page.goto(
      `${MANAGER_APP_URL}/${name}${id === 'L200' ? '?tab=customTab' : ''}`,
    )
    await expect(manager.page.locator('main')).toContainText('Hello2')
    await expect(manager.page.locator('main')).toContainText(
      'fakeemail@fake.com',
    )
    await expect(manager.page.locator('main')).toContainText(/twitter.com/)
    await explorer.page.goto(`${PORTAL_APP_URL}/${name}/records`)
    for (const value of [
      'Hello2',
      'https://twitter.com',
      'fakeemail@fake.com',
      'bc1qjqg9slurvjukfl92wp58y94480fvh4uc2pwa6n',
      '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC',
      'ipfs://bafybeico3uuyj3vphxpvbowchdwjlrlrh62awxscrnii7w7flu5z6fk77y',
    ])
      await expect(explorer.page.locator('main')).toContainText(value)
    if (id === 'L200')
      expect(new URL(manager.page.url()).pathname).toBe(`/${name}`)
    await info.attach('display-adaptation', {
      body: `Manager shows profile text; Explorer Records exposes full addresses and contenthash. Unknown legacy tab is ignored; current URL ${manager.page.url()}`,
      contentType: 'text/plain',
    })
  })
}
test('L201 timezone can be written, displayed and cleared; preserve relative-offset behavior', async ({
  explorer,
  manager,
  accounts,
}, info) => {
  const account = privateKeyToAccount(accounts.getPrivateKey('user')),
    resolver = await profileResolver('legacy', account)
  const name = await createMakeV1Name({ userAccount: account })({
    label: 'l201',
    type: 'unwrapped',
  })
  await setV1RecordsOn(name, account, false, {}, { resolver })
  await waitForBignameBlock()
  const page = explorer.page
  await page.goto(`${PORTAL_APP_URL}/${name}/edit-records`)
  await page.getByLabel('Type', { exact: true }).selectOption('text')
  await page.getByLabel('Key', { exact: true }).fill('timezone')
  await page.getByLabel('Value', { exact: true }).fill('Asia/Tokyo')
  await page.getByRole('button', { name: 'Add record', exact: true }).click()
  await page.getByRole('button', { name: 'Save 1 change', exact: true }).click()
  await driveTransactionsToSuccess(page, explorer.wallet, [
    'tx-save-resolver-records',
  ])
  const read = () =>
    publicClient.readContract({
      address: resolver,
      abi: RESOLVER_ABI,
      functionName: 'text',
      args: [namehash(name), 'timezone'],
    })
  expect(await read()).toBe('Asia/Tokyo')
  await manager.page.goto(`${MANAGER_APP_URL}/${name}`)
  await expect(manager.page.locator('main')).toContainText('Asia/Tokyo')
  await expect
    .soft(
      manager.page.locator('main'),
      'Original profile displays a viewer-relative offset alongside the IANA zone',
    )
    .toContainText(/Asia\/Tokyo\s*\([+-]\d{2}:\d{2}\)/, { timeout: 3000 })
  await info.attach('timezone-display', {
    body: await manager.page.locator('main').innerText(),
    contentType: 'text/plain',
  })
  await page.goto(`${PORTAL_APP_URL}/${name}/edit-records`)
  const row = page
    .getByRole('row')
    .filter({ has: page.getByText('timezone', { exact: true }) })
  await row.getByRole('button', { name: 'Delete record', exact: true }).click()
  await page.getByRole('button', { name: 'Confirm', exact: true }).click()
  await page.getByRole('button', { name: 'Save 1 change', exact: true }).click()
  await driveTransactionsToSuccess(page, explorer.wallet, [
    'tx-save-resolver-records',
  ])
  expect(await read()).toBe('')
  await info.attach('timezone-workaround', {
    body: 'Explorer generic text record replaces the searchable timezone picker. Manually enter the IANA identifier, then clear it through Delete record. Relative-offset display is checked separately.',
    contentType: 'text/plain',
  })
})
for (const key of ['avatar', 'header']) {
  test(`${key === 'avatar' ? 'L232' : 'L233'} validate manual ${key} image URL before accepting it`, async ({
    explorer,
    manager,
    accounts,
  }, info) => {
    const account = privateKeyToAccount(accounts.getPrivateKey('user'))
    const name = await createMakeV1Name({ userAccount: account })({
      label: `image-${key}`,
      type: 'unwrapped',
      records: { texts: [{ key: 'description', value: `manual ${key} test` }] },
    })
    await waitForBignameBlock()
    await manager.page.goto(`${MANAGER_APP_URL}/${name}`)
    await expect(manager.page.locator('main')).toContainText(
      `manual ${key} test`,
    )
    await info.attach('manager-edit-controls', {
      body: await manager.page.locator('main').innerText(),
      contentType: 'text/plain',
    })
    const page = explorer.page
    await page.route('https://parity.invalid/non-image', (route) =>
      route.fulfill({ contentType: 'text/plain', body: 'not an image' }),
    )
    await page.goto(`${PORTAL_APP_URL}/${name}/edit-records`)
    await page.getByLabel('Type', { exact: true }).selectOption('text')
    await page.getByLabel('Key', { exact: true }).fill(key)
    await page
      .getByLabel('Value', { exact: true })
      .fill('https://parity.invalid/non-image')
    await expect
      .soft(
        page.getByRole('button', { name: 'Add record', exact: true }),
        'Non-image URL should not be accepted as a profile image',
      )
      .toBeDisabled({ timeout: 3000 })
    await expect
      .soft(
        page.locator('main'),
        'User must receive an inline invalid-image explanation',
      )
      .toContainText(/not.*image|invalid image/i, { timeout: 3000 })
    await page
      .getByLabel('Value', { exact: true })
      .fill(
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      )
    await expect(
      page.getByRole('button', { name: 'Add record', exact: true }),
    ).toBeEnabled()
    await info.attach('image-validation-result', {
      body: await page.locator('main').innerText(),
      contentType: 'text/plain',
    })
  })
}
