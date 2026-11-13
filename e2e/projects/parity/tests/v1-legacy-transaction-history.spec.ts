import { labelhash, namehash, parseAbi, parseAbiItem } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import {
  createMakeV1Name,
  V1_BASE_REGISTRAR,
  V1_ENS_REGISTRY,
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

for (const id of ['L274', 'L275', 'L276', 'L277', 'L278']) {
  test(`${id} transaction details and history replacement`, async ({
    explorer,
    manager,
    accounts,
  }, info) => {
    test.setTimeout(150_000)
    const name = await createMakeV1Name({
      userAccount: privateKeyToAccount(accounts.getPrivateKey('user')),
    })({ label: id.toLowerCase(), type: 'unwrapped' })
    await waitForBignameBlock()
    const page = explorer.page,
      recipient = accounts.getAddress('user3')
    await page.goto(`${PORTAL_APP_URL}/${name}/ownership/transfer`)
    await page.getByPlaceholder('ENS name or address').fill(recipient)
    const detach = page.getByRole('switch', { name: /Detach the resolver/ })
    if ((await detach.count()) && (await detach.isChecked()))
      await detach.uncheck()
    const eth = page.getByRole('switch', { name: /Set the ETH address/ })
    if (
      (await eth.isVisible()) &&
      (await eth.isEnabled()) &&
      (await eth.isChecked())
    )
      await eth.uncheck()
    await page
      .getByRole('button', { name: 'Transfer name', exact: true })
      .click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toContainText(/Hand over manager/i)
    await expect(dialog).toContainText(/Transfer name/i)
    await info.attach('transaction-details', {
      body: await dialog.innerText(),
      contentType: 'text/plain',
    })
    let completionObserved = false
    const done = dialog.getByRole('button', { name: 'Done', exact: true })
    // Observe completion before the driver clicks Done; concurrent polling can miss this short-lived state.
    await page.addLocatorHandler(
      done,
      async () => {
        completionObserved = true
        await info.attach('visible-completion', {
          body: await dialog.innerText(),
          contentType: 'text/plain',
        })
      },
      { times: 1, noWaitAfter: true },
    )
    const transferStart = await publicClient.getBlockNumber({ cacheTime: 0 })
    await driveTransactionsToSuccess(page, explorer.wallet, [
      `transfer-${name}-reclaim`,
      `transfer-${name}-transfer-erc721`,
    ])
    expect(
      completionObserved,
      'Visible Done completion must be observed before closing the transaction dialog',
    ).toBe(true)
    expect(
      (
        await publicClient.readContract({
          address: V1_ENS_REGISTRY,
          abi: parseAbi(['function owner(bytes32) view returns(address)']),
          functionName: 'owner',
          args: [namehash(name)],
        })
      ).toLowerCase(),
    ).toBe(recipient.toLowerCase())
    const transfers = await publicClient.getLogs({
      address: V1_BASE_REGISTRAR,
      event: parseAbiItem(
        'event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)',
      ),
      args: { to: recipient, tokenId: BigInt(labelhash(name.split('.')[0])) },
      fromBlock: transferStart,
    })
    expect(transfers).toHaveLength(1)
    const hash = transfers[0].transactionHash
    await info.attach('confirmed-transfer', {
      body: JSON.stringify({ name, hash, recipient }),
      contentType: 'application/json',
    })
    if (id === 'L274') return // Original case covers transaction details and completion, not a history list.
    await waitForBignameBlock()
    await page.goto(`${PORTAL_APP_URL}/addr/${recipient}/history`)
    await page.getByRole('button', { name: 'Expand all', exact: true }).click()
    await expect(
      page.locator(`a[href*="${hash}" i]:visible`).first(),
      'History must include the exact confirmed transfer transaction',
    ).toBeVisible()
    await info.attach('confirmed-history', {
      body: await page.locator('main').innerText(),
      contentType: 'text/plain',
    })
    if (['L276', 'L277', 'L278'].includes(id)) {
      // Confirmed on-chain history is a positive control, not a substitute for failed/pending local wallet history.
      await manager.page.goto(`${MANAGER_APP_URL}/dashboard`)
      await expect(manager.page.locator('main')).toBeVisible()
      await manager.page.waitForLoadState('networkidle')
      const explorerMenu = page.getByRole('button', {
        name: /^Wallet menu for /,
      })
      if (await explorerMenu.count()) await explorerMenu.click()
      const managerMenu = manager.page
        .locator('nav button')
        .filter({ has: manager.page.locator('img[alt$=" pattern"]') })
      if ((await managerMenu.count()) === 1) await managerMenu.click()
      await info.attach('explorer-wallet-menu', {
        body: await page.locator('body').innerText(),
        contentType: 'text/plain',
      })
      const action =
        id === 'L278'
          ? /Clear history|Clear transactions/i
          : /Transaction history|Pending transactions|Failed transactions/i
      const controls = page
        .getByRole('button', { name: action })
        .or(page.getByRole('link', { name: action }))
      const managerControls = manager.page
        .getByRole('button', { name: action })
        .or(manager.page.getByRole('link', { name: action }))
      await info.attach('manager-history-entrypoints', {
        body: await manager.page.locator('body').innerText(),
        contentType: 'text/plain',
      })
      expect(
        (await controls.count()) + (await managerControls.count()),
        id === 'L278'
          ? 'No clearable local transaction history UI located; on-chain history cannot implement Clear History'
          : 'No pending/failed wallet history list located. Confirmed on-chain history does not cover unmined or reverted transaction notifications.',
      ).toBeGreaterThan(0)
      throw new Error(
        'History controls discovered: execute pending/reverted/clear original oracle before certifying parity',
      )
    }
    await info.attach('history-workaround', {
      body: 'Transaction plan shows manager handover and owner transfer; Done indicates completion. Explorer address History provides the persisted confirmed transaction list. The old toast and local wallet list are replaced by these surfaces.',
      contentType: 'text/plain',
    })
  })
}
