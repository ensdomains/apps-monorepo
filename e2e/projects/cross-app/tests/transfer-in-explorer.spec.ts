/**
 * A transfer made in the explorer, observed in the manager by both parties
 * (scenarios X4 and X14; e2e-gap-analysis.md §2.1–2.2).
 *
 * The explorer's own transfer tests (`portal/tests/transfer.spec.ts`) check
 * the chain and the explorer. These drive the same UI flow, then open the
 * manager as the sender and as the recipient.
 */

import { ensL1Contracts, supportedL1Chains } from '@ensdomains/ensjs/chain'
import type { Page } from '@playwright/test'
import type { Address } from 'viem'

import {
  asAccount,
  expect,
  MANAGER_APP_URL,
  PORTAL_APP_URL,
  test,
} from '../../../fixtures/playwright.cross-app.fixture.js'
import { waitForBignameBlock } from '../../../helpers/bigname-sync.js'
import { explorerCanReadRootHolders } from '../../../helpers/indexer-sync.js'
import { driveTransactionsToSuccess } from '../../../helpers/transaction-modal.js'
import { readV2Holding } from '../../../helpers/v2-transfer.js'

const labelOf = (name: string) => name.replace(/\.eth$/, '')

/** Transfer `name` to `recipient` through the explorer's transfer page. */
async function transferInExplorer(
  explorer: {
    page: Page
    wallet: Parameters<typeof driveTransactionsToSuccess>[1]
  },
  name: string,
  recipient: Address,
  options: { detachResolver: boolean },
) {
  const { page, wallet } = explorer
  await page.goto(`${PORTAL_APP_URL}/${name}/ownership/transfer`)
  await expect(
    page.getByRole('heading', { name: 'Transfer ownership' }),
  ).toBeVisible({ timeout: 15_000 })
  await page.getByPlaceholder('ENS name or address').fill(recipient)

  // "Detach the resolver" defaults on whenever the name has one.
  const detach = page.getByRole('switch', { name: /Detach the resolver/ })
  await expect(detach).toBeChecked({ timeout: 15_000 })
  if (!options.detachResolver) await detach.click()

  const transfer = page.getByRole('button', { name: 'Transfer name' })
  await expect(transfer).toBeEnabled({ timeout: 15_000 })
  await transfer.click()
  await driveTransactionsToSuccess(page, wallet, [
    ...(options.detachResolver ? [`transfer-${name}-detach-resolver`] : []),
    `transfer-${name}-transfer-token`,
  ])
  await expect(page).toHaveURL(new RegExp(`/${name}/ownership$`), {
    timeout: 30_000,
  })
}

/** The connected account's My Names in the manager, filtered to `name`. */
async function myNamesRow(page: Page, name: string) {
  await page.goto(`${MANAGER_APP_URL}/dashboard`)
  await page.waitForLoadState('networkidle')
  await page.getByPlaceholder('Search my names').fill(name)
  return page.getByRole('link', { name, exact: true })
}

test.describe('A transfer in the explorer, seen in the manager', () => {
  test.describe.configure({ timeout: 300_000 })
  test.beforeEach(async () => {
    // Only while the explorer reads role holders from Panoptes: with #1354 it
    // reads bigname (E2E_EXPLORER_INDEXER=bigname) and the guard is moot.
    test.skip(
      process.env.E2E_EXPLORER_INDEXER !== 'bigname' &&
        !(await explorerCanReadRootHolders(
          ensL1Contracts[supportedL1Chains.sepolia].ensRegistry.address,
        )),
      'the local Panoptes lists over 1000 root role holders, so the explorer refuses every transfer (e2e-defects.md, "Local Panoptes root role holders"); the on-chain twins in manager/tests/transfer-observers.spec.ts run instead',
    )
  })

  test('the name leaves the sender’s My Names and joins the recipient’s', {
    tag: ['@scenario:X4'],
  }, async ({ explorer, manager, accounts, makeV2Name }) => {
    const recipient = accounts.getAddress('user3') as Address
    const name = await makeV2Name({ label: 'x4-ui' })

    // Before: the sender lists it.
    await expect(await myNamesRow(manager.page, name)).toBeVisible({
      timeout: 30_000,
    })

    await transferInExplorer(explorer, name, recipient, {
      detachResolver: true,
    })
    const forSender = await readV2Holding(
      labelOf(name),
      accounts.getAddress('user') as Address,
    )
    expect(forSender.owner.toLowerCase()).toBe(recipient.toLowerCase())
    expect(forSender.roles).toBe(0n)
    await waitForBignameBlock()

    // The sender: gone.
    await expect(
      await myNamesRow(manager.page, name),
      `${name} now belongs to ${recipient}`,
    ).toHaveCount(0, { timeout: 30_000 })

    // The recipient: listed, as owner.
    await asAccount(manager, accounts, 'user3')
    const row = await myNamesRow(manager.page, name)
    await expect(row).toBeVisible({ timeout: 30_000 })
  })

  test('a detached resolver’s records leave the manager profile', {
    tag: ['@scenario:X14'],
  }, async ({ explorer, manager, accounts, makeV2Name }) => {
    const recipient = accounts.getAddress('user3') as Address
    const description = `x14 record ${Date.now().toString(36)}`
    const name = await makeV2Name({
      label: 'x14-ui',
      records: [{ key: 'description', value: description }],
    })

    // Before: the manager has loaded the profile, record and all, so a
    // stale cache would keep showing it.
    await manager.page.goto(`${MANAGER_APP_URL}/${name}`)
    await expect(manager.page.getByText(description)).toBeVisible({
      timeout: 30_000,
    })

    await transferInExplorer(explorer, name, recipient, {
      detachResolver: true,
    })
    await waitForBignameBlock()

    await manager.page.reload()
    await expect(manager.page.getByRole('heading', { name })).toBeVisible({
      timeout: 30_000,
    })
    await expect(
      manager.page.getByText(description),
      'the name has no resolver now, so it has no records',
    ).toHaveCount(0, { timeout: 30_000 })
  })
})
