/**
 * Bulk renewal from the manager dashboard, beyond B8–B10 (migration-time.spec).
 *
 * The dashboard's Renew dialog renews held V2 `.eth` 2LDs only
 * (`NamesTable.tsx` `selectedNames`, `MyNamesList.tsx` `selectable`): a V1 name
 * renews on its own (`/renew-v1/$name`) or, in grace, inside the upgrade flow.
 * The explorer renews V1 and V2 names together; these pin what the manager
 * offers instead, so a change either way is a deliberate one.
 */
import { getExpiry } from '@ensdomains/ensjs/public/v2'
import { type Hex, toFunctionSelector, toHex } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { createMakeV1Name } from '../../../fixtures/makeV1Name.js'
import { expect, test } from '../../../fixtures/playwright.manager.fixture.js'
import { publicClient } from '../../../helpers/anvil-client.js'
import {
  isRealBigname,
  waitForBignameBlock,
} from '../../../helpers/bigname-sync.js'
import { authorizeTransactionsWhile } from '../../../helpers/manager-auth.js'
import { serveV1Names } from '../../../helpers/v1-names.js'

const MANAGER_APP_URL = process.env.MANAGER_APP_URL ?? 'http://localhost:3000'

/** `HCA_RENEWAL_INTENT_MAX_ITEMS` (apps/manager/.../renew/service/hcaRenewal.ts). */
const NAMES_PER_INTENT = 25
/**
 * An intent renews several names with one `renewBatch`, and a lone name with
 * a plain `renew` (`hcaRenewal.ts`), so a chunk of one carries the latter.
 */
const RENEW_SELECTORS = [
  'renewBatch((string,uint64,bytes32)[],address)',
  'renew((string,uint64,bytes32),address)',
].map((signature) => toFunctionSelector(signature).slice(2))

/** Approve the smart-account funding prompt whenever it shows, until `done`. */
async function approveFundingUntil(
  page: import('@playwright/test').Page,
  done: import('@playwright/test').Locator,
  timeout = 300_000,
) {
  const prompt = page.getByRole('alertdialog', {
    name: 'Approve the renewal payment?',
  })
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    if (await done.isVisible().catch(() => false)) return
    if (await prompt.isVisible().catch(() => false))
      await prompt
        .getByRole('button', { name: 'Approve', exact: true })
        .click()
        .catch(() => {})
    await page.waitForTimeout(500)
  }
  await expect(done).toBeVisible()
}

/** Mined transactions after `fromBlock` whose calldata renews names. */
async function renewTxsSince(fromBlock: bigint): Promise<Hex[]> {
  const head = await publicClient.getBlockNumber({ cacheTime: 0 })
  const inputs: Hex[] = []
  for (let n = fromBlock + 1n; n <= head; n++) {
    const block = await publicClient.getBlock({
      blockNumber: n,
      includeTransactions: true,
    })
    for (const tx of block.transactions)
      if (RENEW_SELECTORS.some((sel) => tx.input.includes(sel)))
        inputs.push(tx.input)
  }
  return inputs
}

test.describe('Manager bulk renew — V1 and V2 names', () => {
  test.describe.configure({ timeout: 300_000 })

  test('a wallet holding a V1 and a V2 name can bulk-renew only the V2 one', {
    tag: ['@scenario:B25'],
  }, async ({
    migrationConnectedPage: page,
    makeV2Name,
    accounts,
    mockBigname,
  }) => {
    test.skip(
      !isRealBigname,
      'the dashboard has to list both names from the real index',
    )
    const owner = privateKeyToAccount(accounts.getPrivateKey('user'))
    const tag = `b25${Date.now().toString(36)}`
    const v2 = await makeV2Name({ label: `${tag}n` })
    const v1 = await createMakeV1Name({ userAccount: owner })({
      label: `${tag}o`,
    })
    await serveV1Names(
      page,
      [{ name: v1, ownerAddress: owner.address, type: 'unwrapped' }],
      { indexer: mockBigname },
    )
    await waitForBignameBlock()

    await page.goto(`${MANAGER_APP_URL}/dashboard`)
    const main = page.locator('main')
    const selectAll = main.getByRole('button', { name: /^Select all names$/ })
    await expect(selectAll).toBeVisible({ timeout: 60_000 })
    const search = page.getByPlaceholder('Search my names')
    // The visible fixtures may already be in the unfiltered list. Wait for
    // the debounced search request before Select all reads its filter.
    const filtered = page.waitForResponse((response) => {
      const url = new URL(response.url())
      return (
        url.pathname.endsWith('/names') &&
        url.searchParams.get('q') === tag &&
        response.ok()
      )
    })
    await search.fill(tag)
    await filtered
    await expect(search).toHaveValue(tag)

    // Both are listed as the wallet's own names…
    for (const name of [v2, v1])
      await expect(main.getByText(name, { exact: true }).first()).toBeVisible({
        timeout: 60_000,
      })
    // …but only the V2 one can be picked for renewal.
    await expect(
      main.getByRole('button', { name: `Select ${v2}`, exact: true }),
    ).toBeVisible()
    await expect(
      main.getByRole('button', { name: `Select ${v1}`, exact: true }),
      'a V1 name offers no selection',
    ).toHaveCount(0)

    // Select-all picks every renewable name under the search: the V2 one.
    await selectAll.click()
    const oneSelected = main.getByText('1 selected')
    await oneSelected.waitFor({ timeout: 30_000 }).catch(async () => {
      // Diagnose an intermittent miss: what the selection bar said instead.
      const bar = await selectAll.locator('xpath=../..').innerText()
      console.log(`[B25] selection bar: ${bar.replace(/\s+/g, ' ')}`)
    })
    await expect(oneSelected).toBeVisible()
    await main.getByRole('button', { name: 'Renew', exact: true }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog.getByText(v2).first()).toBeVisible({ timeout: 30_000 })
    await expect(
      dialog.getByText(v1),
      'the V1 name is not in the bulk renewal',
    ).toHaveCount(0)
  })

  test('more names than one intent holds: 26 names renew in two intents, each name once', {
    tag: ['@scenario:B26'],
  }, async ({ migrationConnectedPage: page, makeV2Name, wallet }) => {
    test.skip(
      !isRealBigname,
      'the dashboard has to list the names from the real index',
    )
    test.skip(
      process.env.E2E_MANAGER_SIGNER === 'eoa',
      'chunking is the smart-account intent route',
    )
    test.setTimeout(2_400_000)
    // Keep dev auto-funding from using the same EOA nonce while fixtures seed
    // a batch. The dashboard is opened again after every name is indexed.
    await page.goto('about:blank')
    const tag = `b26${Date.now().toString(36)}`
    const labels: string[] = []
    for (let i = 0; i < NAMES_PER_INTENT + 1; i++)
      labels.push(
        (await makeV2Name({ label: `${tag}n${i}` })).replace(/\.eth$/, ''),
      )
    const expiryOf = (label: string) =>
      getExpiry(publicClient as never, {
        name: `${label}.eth`,
      }) as Promise<bigint>
    const before = await Promise.all(labels.map(expiryOf))
    const fromBlock = await publicClient.getBlockNumber({ cacheTime: 0 })

    await waitForBignameBlock()
    await page.goto(`${MANAGER_APP_URL}/dashboard`)
    const main = page.locator('main')
    const selectAll = main.getByRole('button', { name: /^Select all names$/ })
    await expect(selectAll).toBeVisible({ timeout: 60_000 })
    const search = page.getByPlaceholder('Search my names')
    // The visible fixtures may already be in the unfiltered list. Wait for
    // the debounced search request before Select all reads its filter.
    const filtered = page.waitForResponse((response) => {
      const url = new URL(response.url())
      return (
        url.pathname.endsWith('/names') &&
        url.searchParams.get('q') === tag &&
        response.ok()
      )
    })
    await search.fill(tag)
    await filtered
    await expect(search).toHaveValue(tag)
    await expect(main.getByText(`${labels[0]}.eth`).first()).toBeVisible({
      timeout: 60_000,
    })
    await selectAll.click()
    await expect(main.getByText(`${labels.length} selected`)).toBeVisible({
      timeout: 60_000,
    })
    await main.getByRole('button', { name: 'Renew', exact: true }).click()
    const dialog = page.getByRole('dialog')
    await dialog.getByRole('button', { name: 'Next', exact: true }).click()
    await dialog.getByRole('button', { name: /USDC/ }).first().click()
    let done = false
    const authorizing = authorizeTransactionsWhile(page, wallet, () => done)
    await dialog.getByRole('button', { name: 'Confirm', exact: true }).click()
    await approveFundingUntil(page, page.getByText('Renewal Complete'))
    done = true
    await authorizing

    const after = await Promise.all(labels.map(expiryOf))
    for (const [i, label] of labels.entries()) {
      const moved = after[i] - before[i]
      expect(moved, `${label} renewed once`).toBeGreaterThanOrEqual(
        365n * 86_400n,
      )
      expect(moved).toBeLessThanOrEqual(366n * 86_400n)
    }
    // Two intents: a full `renewBatch` and a `renew` for the one left over.
    const perBatch = (await renewTxsSince(fromBlock))
      .map(
        (input) =>
          labels.filter((l) => input.includes(toHex(l).slice(2))).length,
      )
      .filter((count) => count > 0)
      .sort((a, b) => a - b)
    expect(perBatch, 'names per renewal transaction').toEqual([
      1,
      NAMES_PER_INTENT,
    ])
  })
})
