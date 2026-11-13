import { ensL1Contracts, supportedL1Chains } from '@ensdomains/ensjs/chain'
import { decodeFunctionData, type Hex, labelhash, padHex, parseAbi } from 'viem'
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
for (const c of [
  { id: 'L071', wrapped: false, referrer: true },
  { id: 'L072', wrapped: false, referrer: false },
  { id: 'L073', wrapped: false, referrer: true, grace: true },
  { id: 'L074', wrapped: true, referrer: true },
  { id: 'L075', wrapped: true, referrer: true, navigate: true },
  { id: 'L076', wrapped: true, referrer: false },
  { id: 'L079', wrapped: true, referrer: true, grace: true },
]) {
  test(`${c.id} renew V1 ${c.wrapped ? 'wrapped' : 'unwrapped'} name ${c.referrer ? 'with' : 'without'} referrer${c.grace ? ' in grace' : ''}`, async ({
    portalPage: page,
    wallet,
    accounts,
  }, info) => {
    test.setTimeout(150_000)
    const name = await createMakeV1Name({
      userAccount: privateKeyToAccount(accounts.getPrivateKey('user')),
    })({ label: c.id.toLowerCase(), type: c.wrapped ? 'wrapped' : 'unwrapped' })
    const readExpiry = () =>
      publicClient.readContract({
        address: V1_BASE_REGISTRAR,
        abi: parseAbi(['function nameExpires(uint256) view returns (uint256)']),
        functionName: 'nameExpires',
        args: [BigInt(labelhash(name.split('.')[0]))],
      })
    const before = await readExpiry()
    if (c.grace) {
      await testClient.setNextBlockTimestamp({ timestamp: before + 86400n })
      await testClient.mine({ blocks: 1 })
    }
    await waitForBignameBlock()
    await connectWithHeadlessWallet(page, wallet)
    const referrer = '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd' as Hex
    await page.goto(`/${name}${c.referrer ? `?referrer=${referrer}` : ''}`)
    await expect(
      page.locator('main').getByRole('heading', { level: 1 }),
    ).toBeVisible()
    if (c.navigate) await page.getByRole('link', { name: /Ownership$/ }).click()
    const extend = page.getByRole('button', { name: 'Extend', exact: true })
    if (!(await extend.isVisible())) {
      await info.attach('renewal-entry-workaround', {
        body: 'V1 profile offers upgrade, not renewal. Open Explorer address Names, search and select the V1 name, then Extend. Referrer query is explicitly retained in this manual navigation.',
        contentType: 'text/plain',
      })
      await page.goto(
        `/addr/${accounts.getAddress('user')}/names${c.referrer ? `?referrer=${referrer}` : ''}`,
      )
      await page.getByPlaceholder('Search names...').fill(name.split('.')[0])
      const row = page.getByRole('row').filter({ hasText: name })
      await expect(row).toHaveCount(1)
      await row.getByRole('checkbox').first().check()
    }
    await extend.click()
    const dialog = page.getByRole('dialog')
    const disclaimer = dialog.getByRole('button', { name: 'I Understand' })
    const next = dialog.getByRole('button', { name: 'Next', exact: true })
    await expect(disclaimer.or(next).first()).toBeVisible()
    if (await disclaimer.isVisible())
      await disclaimer.click({ timeout: 3000 }).catch(() => {})
    await expect(next).toBeEnabled()
    await next.click()
    await dialog.getByRole('button', { name: /^USDC\b/ }).click()
    const start = await publicClient.getBlockNumber({ cacheTime: 0 })
    await dialog.getByRole('button', { name: /^(Confirm|Next)$/ }).click()
    await expect(page.locator('[data-slot="dialog-content"]')).toHaveCount(1)
    await driveTransactionsToSuccess(page, wallet, [
      `renewal-approve-${renewer}`,
      `renewal-renew-${name}`,
    ])
    const after = await readExpiry()
    expect(after - before).toBeGreaterThanOrEqual(365n * 86400n)
    expect(after - before).toBeLessThanOrEqual(366n * 86400n)
    const end = await publicClient.getBlockNumber({ cacheTime: 0 })
    const inputs: Hex[] = []
    for (let b = start + 1n; b <= end; b++)
      for (const tx of (
        await publicClient.getBlock({
          blockNumber: b,
          includeTransactions: true,
        })
      ).transactions)
        if (tx.to?.toLowerCase() === renewer.toLowerCase())
          inputs.push(tx.input)
    await info.attach('renewal-calldata', {
      body: JSON.stringify({
        name,
        expiryBefore: String(before),
        expiryAfter: String(after),
        inputs,
      }),
      contentType: 'application/json',
    })
    expect(inputs).toHaveLength(1)
    const decoded = decodeFunctionData({
      abi: parseAbi([
        'function renew((string label,uint64 duration,bytes32 referrer) renewal,address paymentToken)',
      ]),
      data: inputs[0],
    })
    expect(
      decoded.args[0].referrer.slice(2),
      'The submitted referrer must match the URL; no-referrer runs use zero',
    ).toBe(
      c.referrer ? padHex(referrer, { size: 32 }).slice(2) : '0'.repeat(64),
    )
  })
}
