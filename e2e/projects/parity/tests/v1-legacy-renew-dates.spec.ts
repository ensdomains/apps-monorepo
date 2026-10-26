import { ensL1Contracts, supportedL1Chains } from '@ensdomains/ensjs/chain'
import { labelhash, parseAbi } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import {
  createMakeV1Name,
  V1_BASE_REGISTRAR,
} from '../../../fixtures/makeV1Name.js'
import {
  connectWithHeadlessWallet,
  expect,
  test,
} from '../../../fixtures/playwright.portal.fixture.js'
import { publicClient, testClient } from '../../../helpers/anvil-client.js'
import { waitForBignameBlock } from '../../../helpers/bigname-sync.js'
import { driveTransactionsToSuccess } from '../../../helpers/transaction-modal.js'

const renewer =
  ensL1Contracts[supportedL1Chains.sepolia].ensEthRenewerV1.address
for (const id of [
  'L057',
  'L058',
  'L059',
  'L061',
  'L062',
  'L063',
  'L064',
  'L187',
]) {
  test(`${id} V1 renewal duration and expiry through Explorer`, async ({
    portalPage: page,
    wallet,
    accounts,
  }, info) => {
    test.setTimeout(240_000)
    const owner = ['L057', 'L059', 'L187'].includes(id) ? 'user2' : 'user'
    const name = await createMakeV1Name({
      userAccount: privateKeyToAccount(accounts.getPrivateKey(owner)),
    })({ label: id.toLowerCase(), type: 'unwrapped' })
    const read = () =>
      publicClient.readContract({
        address: V1_BASE_REGISTRAR,
        abi: parseAbi(['function nameExpires(uint256) view returns (uint256)']),
        functionName: 'nameExpires',
        args: [BigInt(labelhash(name.split('.')[0]))],
      })
    const before = await read(),
      grace = ['L058', 'L059', 'L063', 'L064'].includes(id)
    if (grace) {
      await testClient.setNextBlockTimestamp({
        timestamp: before + BigInt(id === 'L059' ? 14 : 1) * 86400n,
      })
      await testClient.mine({ blocks: 1 })
    }
    await waitForBignameBlock()
    await connectWithHeadlessWallet(page, wallet)
    await page.goto(`/${name}${id === 'L187' ? '/ownership' : ''}`)
    await expect(
      page.locator('main').getByRole('heading', { level: 1 }),
    ).toBeVisible()
    if (grace)
      await expect.soft(page.locator('main')).toContainText(/grace|expired/i)
    await page.goto(`/addr/${accounts.getAddress(owner)}/names`)
    await page.getByPlaceholder('Search names...').fill(name.split('.')[0])
    const row = page.getByRole('row').filter({ hasText: name })
    await expect(row).toHaveCount(1)
    await row.getByRole('checkbox').first().check()
    await page.getByRole('button', { name: 'Extend', exact: true }).click()
    const dialog = page.getByRole('dialog'),
      understand = dialog.getByRole('button', { name: 'I Understand' }),
      next = dialog.getByRole('button', { name: 'Next', exact: true })
    await expect(understand.or(next).first()).toBeVisible()
    if (await understand.isVisible())
      await understand.click({ timeout: 3000 }).catch(() => {})
    let seconds: bigint | undefined
    if (['L061', 'L062', 'L063', 'L064'].includes(id)) {
      const target = new Date(Number(before) * 1000)
      if (['L061', 'L063'].includes(id))
        target.setUTCMonth(target.getUTCMonth() + 1)
      else target.setUTCDate(target.getUTCDate() + 1)
      seconds = BigInt(
        Math.round((target.getTime() - Number(before) * 1000) / 1000),
      )
      await dialog
        .getByRole('button', { name: 'Pick by date', exact: true })
        .click()
      await page.locator('#registration-expiry-date').click()
      await page
        .getByRole('combobox', { name: /Choose the Year/i })
        .selectOption(String(target.getUTCFullYear()))
      await page
        .getByRole('combobox', { name: /Choose the Month/i })
        .selectOption(String(target.getUTCMonth()))
      const formatted = await page.evaluate(
        ({ y, m, d }) => new Date(y, m, d).toLocaleDateString(),
        {
          y: target.getUTCFullYear(),
          m: target.getUTCMonth(),
          d: target.getUTCDate(),
        },
      )
      await page.locator(`button[data-day="${formatted}"]`).click()
    } else {
      const years = dialog.getByRole('spinbutton')
      await expect(years).toHaveValue('1')
      await years.fill('2')
      await expect(years).toHaveValue('2')
      await years.fill('1')
      await expect(years).toHaveValue('1')
    }
    await next.click()
    const token = dialog.getByRole('button', { name: /^USDC\b/ })
    await expect(token).toBeEnabled()
    await token.click()
    await info.attach('renewal-checkout', {
      body: await dialog.innerText(),
      contentType: 'text/plain',
    })
    await dialog.getByRole('button', { name: /^(Confirm|Next)$/ }).click()
    await expect(page.locator('[data-slot="dialog-content"]')).toHaveCount(1)
    await driveTransactionsToSuccess(page, wallet, [
      `renewal-approve-${renewer}`,
      `renewal-renew-${name}`,
    ])
    const after = await read()
    if (seconds) expect(after - before).toBe(seconds)
    else {
      expect(after - before).toBeGreaterThanOrEqual(31536000n)
      expect(after - before).toBeLessThanOrEqual(31622400n)
    }
    await waitForBignameBlock()
    await page.goto(`/${name}/ownership`)
    await info.attach('renewal-expiry', {
      body: JSON.stringify({
        before: String(before),
        after: String(after),
        ui: await page.locator('main').innerText(),
      }),
      contentType: 'application/json',
    })
    const expectedDate = await page.evaluate(
      (timestamp) =>
        new Date(timestamp).toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
        }),
      Number(after) * 1000,
    )
    if (!(await page.locator('main').innerText()).includes(expectedDate)) {
      await info.attach('stale-expiry-before-delayed-refresh', {
        body: await page.locator('main').innerText(),
        contentType: 'text/plain',
      })
      await page.waitForTimeout(65_000)
      await page.reload()
      await info.attach('delayed-refresh-workaround', {
        body: 'Waited 65 seconds for the observed HTTP cache window, then reloaded Ownership. The following full-date assertion determines whether this workaround succeeds.',
        contentType: 'text/plain',
      })
    }
    await expect(page.locator('main')).toContainText(expectedDate)
    await info.attach('renewal-workaround', {
      body: 'Explorer address Names → select → Extend. ETH/fiat toggling is replaced by stablecoin payment selection and live quote; historic mocked ETH prices do not apply. Date duration is verified against registrar expiry.',
      contentType: 'text/plain',
    })
  })
}
