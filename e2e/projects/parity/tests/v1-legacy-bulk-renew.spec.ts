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
for (const id of ['L056', 'L077', 'L078']) {
  test(`${id} renew mixed wrapped and unwrapped V1 names`, async ({
    portalPage: page,
    wallet,
    accounts,
  }, info) => {
    test.setTimeout(240_000)
    const owner = id === 'L056' ? 'user2' : 'user',
      account = privateKeyToAccount(accounts.getPrivateKey(owner)),
      prefix = `${id.toLowerCase()}-${Date.now()}`
    const names: string[] = []
    for (const [i, type] of (id === 'L078'
      ? ['wrapped', 'unwrapped', 'wrapped']
      : ['wrapped', 'unwrapped']
    ).entries())
      names.push(
        await createMakeV1Name({ userAccount: account })({
          label: `${prefix}-${i}`,
          type: type as 'wrapped' | 'unwrapped',
          duration: 30 * 86400,
        }),
      )
    const read = (name: string) =>
      publicClient.readContract({
        address: V1_BASE_REGISTRAR,
        abi: parseAbi(['function nameExpires(uint256) view returns(uint256)']),
        functionName: 'nameExpires',
        args: [BigInt(labelhash(name.split('.')[0]))],
      })
    const before = await Promise.all(names.map(read))
    if (id === 'L056') {
      await testClient.setNextBlockTimestamp({
        timestamp: before.reduce((a, b) => (a > b ? a : b)) + 86400n,
      })
      await testClient.mine({ blocks: 1 })
    }
    await waitForBignameBlock()
    await connectWithHeadlessWallet(page, wallet)
    for (const group of id === 'L077' ? names.map((n) => [n]) : [names]) {
      await page.goto(`/addr/${account.address}/names`)
      await page
        .getByPlaceholder('Search names...')
        .fill(group.length === 1 ? group[0].split('.')[0] : prefix)
      for (const name of group) {
        const row = page.getByRole('row').filter({ hasText: name })
        await expect(row).toHaveCount(1)
        await row.getByRole('checkbox').first().check()
      }
      await page.getByRole('button', { name: 'Extend', exact: true }).click()
      const dialog = page.getByRole('dialog'),
        disclaimer = dialog.getByRole('button', { name: 'I Understand' }),
        next = dialog.getByRole('button', { name: 'Next', exact: true })
      await expect(disclaimer.or(next).first()).toBeVisible()
      if (await disclaimer.isVisible())
        await disclaimer.click({ timeout: 3000 }).catch(() => {})
      if (id === 'L056') {
        await dialog.getByRole('spinbutton').fill('3')
        await expect(dialog.getByRole('spinbutton')).toHaveValue('3')
      }
      // Single-name checkout abbreviates the label; exact selection is asserted above and each transaction/expiry below.
      if (group.length > 1)
        for (const name of group) await expect(dialog).toContainText(name)
      await next.click()
      await dialog.getByRole('button', { name: /^USDC\b/ }).click()
      await dialog.getByRole('button', { name: /^(Confirm|Next)$/ }).click()
      await expect(page.locator('[data-slot="dialog-content"]')).toHaveCount(1)
      await driveTransactionsToSuccess(page, wallet, [
        `renewal-approve-${renewer}`,
        ...group.map((n) => `renewal-renew-${n}`),
      ])
    }
    for (const [i, name] of names.entries()) {
      const after = await read(name),
        years = id === 'L056' ? 3n : 1n
      expect(after - before[i]).toBeGreaterThanOrEqual(years * 31536000n)
      expect(after - before[i]).toBeLessThanOrEqual(years * 31622400n)
      await info.attach(name, {
        body: JSON.stringify({
          before: String(before[i]),
          after: String(after),
        }),
        contentType: 'application/json',
      })
    }
    await info.attach('bulk-adaptation', {
      body: 'Explorer address Names selection supports V1 renewal. Current stablecoin renewer replaces legacy ETH controller selection; each selected name expiry is checked. L077 executes both kinds individually; L056/L078 execute one selected group.',
      contentType: 'text/plain',
    })
  })
}
