/**
 * Portal resolver records — plan §5.E.
 *
 * The oracle is the resolver read, not the form: after saving, the record is
 * fetched back through ensjs exactly as the app would resolve it. The editor
 * is what is under test, so its own rendering proves nothing.
 *
 * `PendingChangesBar` labels its button "Save N changes", which makes the
 * change count an assertable part of E1's oracle rather than an implementation
 * detail — a save that batches the wrong number of keys is visible before the
 * transaction is even sent.
 */

import {
  getAddressRecord,
  getContentHashRecord,
  getResolver,
  getTextRecord,
} from '@ensdomains/ensjs/public'
import { labelToCanonicalId } from '@ensdomains/ensjs/utils/v2'
import { encodeFunctionData, parseAbi } from 'viem'
import { query as queryPanoptes } from '../../../fixtures/panoptes.js'
import {
  connectWithHeadlessWallet,
  expect,
  test,
} from '../../../fixtures/playwright.portal.fixture.js'
import { publicClient, walletClient } from '../../../helpers/anvil-client.js'
import { ETH_REGISTRY } from '../../../helpers/role-assertions.js'
import { driveTransactionsToSuccess } from '../../../helpers/transaction-modal.js'

const PORTAL_APP_URL = process.env.PORTAL_APP_URL ?? 'http://localhost:3001'

/** `routes/$name/edit-records.tsx`. */
const SAVE_RECORDS_TX = 'tx-save-resolver-records'

/** Queue one text record in the editor. Does not save. */
async function addTextRecord(
  page: import('@playwright/test').Page,
  key: string,
  value: string,
) {
  await page.getByLabel('Type', { exact: true }).selectOption('text')
  await page.getByLabel('Key', { exact: true }).fill(key)
  await page.getByLabel('Value', { exact: true }).fill(value)
  await page.getByRole('button', { name: 'Add record' }).click()
}

const readText = (name: string, key: string) =>
  getTextRecord(publicClient as never, { name, key } as never)

const readAddr = (name: string, coin: string) =>
  getAddressRecord(publicClient as never, { name, coin } as never) as Promise<{
    value: string
  } | null>

const readContentHash = (name: string) =>
  getContentHashRecord(publicClient as never, { name } as never)

const SET_RESOLVER_ABI = parseAbi([
  'function setResolver(uint256 anyId, address resolver)',
])

/** Point `label`'s resolver slot at `resolverAddress`, signed by `signer`. */
async function setResolver(
  label: string,
  resolverAddress: `0x${string}`,
  signer: import('viem').Account,
) {
  const hash = await walletClient.sendTransaction({
    account: signer,
    to: ETH_REGISTRY,
    data: encodeFunctionData({
      abi: SET_RESOLVER_ABI,
      functionName: 'setResolver',
      args: [labelToCanonicalId(label), resolverAddress],
    }),
  })
  await publicClient.waitForTransactionReceipt({ hash })
}

/**
 * Pick a coin in the `CoinSelect` popover. It is a search-and-click list, not
 * a native select, so the coin has to be filtered to before it is clickable.
 */
async function selectCoin(page: import('@playwright/test').Page, coin: string) {
  // Three elements carry role=combobox here — the header search (an input),
  // the Type picker (a native select) and this one. Only CoinSelect renders
  // its trigger as a button, and it exposes no accessible name, so the
  // element type is what distinguishes it.
  await page.locator('button[role="combobox"]').click()
  await page.getByPlaceholder('Search coins...').fill(coin)
  await page
    .getByRole('button', { name: new RegExp(`^${coin}\\b`, 'i') })
    .first()
    .click()
}

/** Queue one address record in the editor. Does not save. */
async function addAddressRecord(
  page: import('@playwright/test').Page,
  coin: string,
  value: string,
) {
  await page.getByLabel('Type', { exact: true }).selectOption('address')
  await selectCoin(page, coin)
  await page.getByLabel('Value', { exact: true }).fill(value)
  await page.getByRole('button', { name: 'Add record' }).click()
}

test.describe('Portal resolver records', () => {
  test.describe.configure({ timeout: 300_000 })

  test('saves several text records in one transaction and reads them back on-chain', {
    tag: ['@scenario:E1'],
  }, async ({ portalPage: page, wallet, makeName }) => {
    await connectWithHeadlessWallet(page, wallet)

    // Seed a record so `makeName` deploys a *dedicated* resolver. Without one
    // the name shares a resolver its owner cannot write to, and the save
    // reverts at submission — see fixtures/makeName.ts.
    const name = await makeName({
      label: 'rec-e1',
      owner: 'user',
      records: [{ key: 'seed', value: 'dedicated-resolver' }],
    })
    const records = [
      { key: 'description', value: 'set through the portal editor' },
      { key: 'url', value: 'https://example.com/e1' },
      { key: 'com.twitter', value: 'ensdomains' },
    ]

    await page.goto(`${PORTAL_APP_URL}/${name}/edit-records`)
    for (const record of records) {
      await addTextRecord(page, record.key, record.value)
    }

    // The bar's count is the number of changed keys — three edits must
    // become one save of three changes, not three saves.
    const save = page.getByRole('button', {
      name: `Save ${records.length} changes`,
    })
    await expect(save).toBeVisible({ timeout: 20_000 })
    await save.click()

    await driveTransactionsToSuccess(page, wallet, [SAVE_RECORDS_TX])

    for (const record of records) {
      expect(
        await readText(name, record.key),
        `text(${record.key}) should read back what the editor saved`,
      ).toBe(record.value)
    }
  })

  test('updates and deletes an existing text record', {
    tag: ['@scenario:E1'],
  }, async ({ portalPage: page, wallet, makeName }) => {
    await connectWithHeadlessWallet(page, wallet)

    const name = await makeName({
      label: 'rec-e1b',
      owner: 'user',
      records: [{ key: 'description', value: 'original' }],
    })
    expect(await readText(name, 'description')).toBe('original')

    await page.goto(`${PORTAL_APP_URL}/${name}/edit-records`)
    // Re-adding an existing key is how the editor models an update.
    await addTextRecord(page, 'description', 'rewritten')

    await page
      .getByRole('button', { name: 'Save 1 change' })
      .click({ timeout: 20_000 })
    await driveTransactionsToSuccess(page, wallet, [SAVE_RECORDS_TX])

    expect(
      await readText(name, 'description'),
      'the resolver should hold the new value, not the original',
    ).toBe('rewritten')
  })
  test('blocks record editing for a wallet with no resolver roles', {
    tag: ['@scenario:E5'],
  }, async ({ portalPage: page, wallet, makeName, wallets }) => {
    await connectWithHeadlessWallet(page, wallet)

    const name = await makeName({
      label: 'rec-e5',
      owner: 'user',
      records: [{ key: 'description', value: 'owner only' }],
    })

    await wallets.switchTo('stranger')
    await page.goto(`${PORTAL_APP_URL}/${name}/edit-records`)

    // The guard must be the editor refusing to open, not the chain rejecting
    // a transaction — "blocked" has to mean no transaction is constructible.
    await expect(
      page.getByText(/don't have permission to edit records/i),
      'a wallet with no resolver roles must be refused up front',
    ).toBeVisible({ timeout: 30_000 })
    await expect(
      page.getByRole('button', { name: 'Add record' }),
      'the editor controls must not be reachable at all',
    ).toHaveCount(0)

    expect(
      await readText(name, 'description'),
      'the existing record must be untouched',
    ).toBe('owner only')
  })

  test('sets address records for an EVM and a non-EVM coin', {
    tag: ['@scenario:E2'],
  }, async ({ portalPage: page, wallet, makeName, wallets }) => {
    await connectWithHeadlessWallet(page, wallet)

    const name = await makeName({
      label: 'rec-e2',
      owner: 'user',
      records: [{ key: 'seed', value: 'dedicated-resolver' }],
    })
    const evm = wallets.address('manager')
    const btc = '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa'

    await page.goto(`${PORTAL_APP_URL}/${name}/edit-records`)
    await addAddressRecord(page, 'ETH', evm)
    await addAddressRecord(page, 'BTC', btc)

    await page
      .getByRole('button', { name: 'Save 2 changes' })
      .click({ timeout: 20_000 })
    await driveTransactionsToSuccess(page, wallet, [SAVE_RECORDS_TX])

    // Both coin types must round-trip: a non-EVM address is encoded
    // differently on-chain, so ETH passing says nothing about BTC.
    expect(
      (await readAddr(name, 'ETH'))?.value?.toLowerCase(),
      'addr(60) should hold the EVM address that was entered',
    ).toBe(evm.toLowerCase())
    expect(
      (await readAddr(name, 'BTC'))?.value,
      'addr(0) should hold the BTC address that was entered',
    ).toBe(btc)
  })

  test('sets a contenthash record', { tag: ['@scenario:E4'] }, async ({
    portalPage: page,
    wallet,
    makeName,
  }) => {
    await connectWithHeadlessWallet(page, wallet)

    const name = await makeName({
      label: 'rec-e4',
      owner: 'user',
      records: [{ key: 'seed', value: 'dedicated-resolver' }],
    })
    const ipfs =
      'ipfs://bafybeico3uuyj3vphxpvbowchdwjlrlrh62awxscrnii7w7flu5z6fk77y'

    await page.goto(`${PORTAL_APP_URL}/${name}/edit-records`)
    // Contenthash is keyless — type and value only.
    await page.getByLabel('Type', { exact: true }).selectOption('contentHash')
    await page.getByLabel('Value', { exact: true }).fill(ipfs)
    await page.getByRole('button', { name: 'Add record' }).click()

    await page
      .getByRole('button', { name: 'Save 1 change' })
      .click({ timeout: 20_000 })
    await driveTransactionsToSuccess(page, wallet, [SAVE_RECORDS_TX])

    const stored = await readContentHash(name)
    expect(
      stored,
      'the resolver should hold a contenthash after saving one',
    ).toBeTruthy()
    expect(
      `${(stored as { protocolType?: string; decoded?: string }).protocolType}://${(stored as { decoded?: string }).decoded}`,
      'contenthash should round-trip the IPFS CID that was entered',
    ).toBe(ipfs)
  })

  test("a resolver contract shared by two names leaks one name's text-record keys onto the other, in the indexer (E2E-008)", {
    tag: ['@scenario:E1'],
  }, async ({ portalPage: page, wallet, makeName, wallets }) => {
    // Repro for a Slack report: the portal's Records page discovers which text
    // *keys* a name has via the indexer's `domains(where:{name}).resolver.texts`
    // field (`features/profile/hooks/useProfile.ts`), then reads their values
    // from chain. That field appears to be keyed by resolver CONTRACT ADDRESS
    // alone, not by (address, node) — so once two DIFFERENT names point their
    // resolver slot at the SAME already-deployed resolver contract (exactly the
    // "point at an existing contract" pattern behind E2E-007, but for resolvers
    // instead of registries), each one's indexed key list bleeds into the
    // other's, even though on-chain each node's records stay correctly scoped.
    //
    // Verified directly against the indexer before writing this test: pointing
    // an unrelated, already-registered name at a resolver that already had
    // text keys indexed showed those keys under the new name's
    // `resolver.texts` immediately, with no record ever written for it.
    test.fail()

    await connectWithHeadlessWallet(page, wallet)

    const nameA = await makeName({
      label: 'res-share-a',
      owner: 'user',
      // Forces a dedicated resolver proxy for A — see the E1 test above.
      records: [{ key: 'seed', value: 'dedicated-resolver' }],
    })
    const nameB = await makeName({ label: 'res-share-b', owner: 'user' })
    const labelB = nameB.replace(/\.eth$/, '')

    const resolverA = await getResolver(
      publicClient as never,
      {
        name: nameA,
      } as never,
    )
    expect(resolverA, `${nameA} must have a resolver to share`).toBeTruthy()

    // nameB links to nameA's already-deployed resolver — a different name
    // taking over a contract it never deployed, same shape as E2E-007's
    // "use a pre-existing registry contract".
    await setResolver(
      labelB,
      resolverA as `0x${string}`,
      wallets.account('owner'),
    )

    const key = `only-on-a-${Date.now().toString(36)}`
    await page.goto(`${PORTAL_APP_URL}/${nameA}/edit-records`)
    await addTextRecord(page, key, 'value-a')
    await page
      .getByRole('button', { name: 'Save 1 change' })
      .click({ timeout: 20_000 })
    await driveTransactionsToSuccess(page, wallet, [SAVE_RECORDS_TX])

    expect(
      await readText(nameA, key),
      `${nameA} should hold the record it was just given`,
    ).toBe('value-a')
    expect(
      await readText(nameB, key),
      `${nameB}'s own node must not have this key on-chain — it never set it`,
    ).toBeFalsy()

    // Wait for the indexer to have processed THIS specific TextChanged event
    // (checked against nameA, which unambiguously owns it) before asserting
    // anything about nameB — otherwise a not-yet-caught-up indexer would make
    // the oracle below pass for the wrong reason (a race, not a fix).
    const domainTextsQuery = `query($name: String!) { domains(where: {name: $name}) { resolver { address texts } } }`
    await expect(async () => {
      const a = await queryPanoptes<{
        domains: { resolver: { texts: string[] } | null }[]
      }>(domainTextsQuery, { name: nameA })
      expect(a.domains[0]?.resolver?.texts ?? []).toContain(key)
    }).toPass({ timeout: 60_000 })

    const result = await queryPanoptes<{
      domains: { resolver: { texts: string[] } | null }[]
    }>(domainTextsQuery, { name: nameB })

    // Oracle: the indexer's key list for nameB must reflect only what was
    // ever set on nameB's own node — not everything ever set on whatever
    // resolver CONTRACT it happens to currently point at.
    expect(
      result.domains[0]?.resolver?.texts ?? [],
      `the indexer's resolver.texts for ${nameB} must not include "${key}" — ` +
        `that was set on ${nameA}'s node, and ${nameB} only shares the same ` +
        'resolver contract, never wrote this key itself',
    ).not.toContain(key)
  })
})
