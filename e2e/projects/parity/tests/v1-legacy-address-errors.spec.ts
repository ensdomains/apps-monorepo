import { setPrimaryName } from '@ensdomains/ensjs/wallet/v1'
import { privateKeyToAccount } from 'viem/accounts'
import { createMakeV1Name } from '../../../fixtures/makeV1Name.js'
import {
  expect,
  MANAGER_APP_URL,
  test,
} from '../../../fixtures/playwright.cross-app.fixture.js'
import { setV1RecordsOn } from '../../../fixtures/v1-records.js'
import { publicClient, walletClient } from '../../../helpers/anvil-client.js'
import { waitForBignameBlock } from '../../../helpers/bigname-sync.js'
import { readPrimaryName } from '../../../helpers/primary-name.js'

for (const id of ['L022', 'L023', 'L024']) {
  test(`${id} address profile remains usable through invalid resolution or transient RPC failures`, async ({
    manager,
    accounts,
  }, info) => {
    test.setTimeout(120_000)
    const account = privateKeyToAccount(
      accounts.getPrivateKey(id === 'L023' ? 'user2' : 'user'),
    )
    const name = await createMakeV1Name({ userAccount: account })({
      label: id.toLowerCase(),
      type: 'unwrapped',
      records: { addresses: [{ coinType: 60, value: account.address }] },
    })
    const reverse = await setPrimaryName(
      walletClient as never,
      { name: id === 'L024' ? '' : name, account } as never,
    )
    await publicClient.waitForTransactionReceipt({ hash: reverse })
    if (id === 'L023')
      await expect.poll(() => readPrimaryName(account.address)).toBe(name)
    else
      await setV1RecordsOn(
        name,
        account,
        false,
        {},
        { resolver: '0x0000000000000000000000000000000000000001' },
      )
    await waitForBignameBlock()
    const page = manager.page
    let calls = 0,
      failed = 0
    if (id === 'L023') {
      await page.route('**/*', async (route) => {
        const payload = route.request().postData() ?? ''
        // Match the observed UniversalResolver reverseWithGateways call inside Multicall3.
        if (
          payload.includes('eth_call') &&
          payload.includes('b7d6ca64') &&
          payload.toLowerCase().includes(account.address.slice(2).toLowerCase())
        ) {
          calls++
          if (failed < 2) {
            failed++
            await route.abort('failed')
            return
          }
        }
        await route.continue()
      })
    }
    if (id === 'L023') {
      // A direct load resolves the profile on the SSR server, outside browser fault interception.
      // Use the real address-search link so the loader runs in the browser.
      await page.goto(`${MANAGER_APP_URL}/?landing=true`)
      await page.waitForLoadState('networkidle')
      const search = page.getByPlaceholder('.eth', { exact: true })
      const addressLink = page
        .locator(`a[href^="/${account.address}" i]:visible`)
        .first()
      await expect(async () => {
        await search.fill(account.address)
        await expect(search).toHaveValue(account.address)
        await expect(addressLink).toBeVisible({ timeout: 3000 })
      }).toPass({ timeout: 30000 })
      await addressLink.click()
    } else await page.goto(`${MANAGER_APP_URL}/${account.address}`)
    await expect(
      page.getByPlaceholder('Search names', { exact: true }),
    ).toBeVisible({ timeout: 45000 })
    await page.getByPlaceholder('Search names', { exact: true }).fill(name)
    await expect(
      page
        .locator('main')
        .getByRole('link', { name: name, exact: true })
        .first(),
    ).toBeVisible({ timeout: 45000 })
    const profile = page.getByRole('link', { name: /View profile/i })
    if (id === 'L023') {
      await expect(profile).toHaveAttribute('href', `/${name}`, {
        timeout: 45000,
      })
      await info.attach('rpc-fault-counts', {
        body: JSON.stringify({ calls, failed }),
        contentType: 'application/json',
      })
      expect(failed).toBe(2)
      expect(calls).toBeGreaterThanOrEqual(3)
    } else await expect(profile).toHaveCount(0)
    await info.attach('address-error-result', {
      body: JSON.stringify({
        name,
        calls,
        failed,
        text: await page.locator('main').innerText(),
      }),
      contentType: 'application/json',
    })
  })
}
