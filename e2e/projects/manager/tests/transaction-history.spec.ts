/**
 * Transaction history across a wallet account switch (WEB-1223, PR #1345).
 *
 * The bug: when IndexedDB is unavailable (Firefox private browsing, Brave
 * with shields up) the transaction manager persists to localStorage, where
 * active records are `tx-<id>` and the archive is `tx-history`. The
 * active-record scans matched on the `tx-` prefix, so `clearActive()` deleted
 * the archive too. The manager calls `clearAllAndPersistence()` from
 * `WalletLifecycle` whenever the connected address differs from the
 * backend-authed one, so an ordinary account switch wiped the whole history.
 *
 * The fix: the scans exclude `tx-history` explicitly (`isActiveKey`).
 *
 * What these reach that the package's unit tests don't: the real trigger (a
 * SIWE sign-in against the backend, then a real `accountsChanged` from the
 * wallet into `WalletLifecycle`), the real backend selection in a browser
 * whose transaction-manager IndexedDB refuses to open, and an archive written
 * by the app itself after a renewal that lands on chain.
 *
 * IndexedDB is refused for the transaction manager's own database only.
 * Refusing every `indexedDB.open` also breaks the wallet stack before the
 * Connect button renders, which is a different failure from the one reported.
 */

import { getExpiry } from '@ensdomains/ensjs/public/v2'
import type { Web3ProviderBackend } from '@ensdomains/headless-web3-provider'
import { expect, type Page } from '@playwright/test'
import { type Address, type Hash, toFunctionSelector, toHex } from 'viem'
import {
  authorizeTransaction,
  test,
} from '../../../fixtures/playwright.manager.fixture.js'
import { publicClient } from '../../../helpers/anvil-client.js'
import {
  connectWithHeadlessWallet,
  signInBackendAuthModal,
} from '../../../helpers/manager-auth.js'
import type { PortalAccounts } from '../../../helpers/portal-auth.js'
import {
  goToProfile,
  renewFor28Days,
} from '../../../helpers/profile-helpers.js'

const MANAGER_APP_URL = process.env.MANAGER_APP_URL ?? 'http://localhost:3000'

const TX_DB_NAME = 'ens-transaction-manager'
const HISTORY_KEY = 'tx-history'
const STORAGE_TYPE_KEY = 'ens-tx-storage-type'
const BACKEND_AUTH_KEY = '@manager-v4/backend_auth'

type StoredTransaction = {
  id: string
  hash?: Hash
  state: string
  context: unknown
  timestamp: number
  updatedAt: number
}

/** Make the transaction manager's IndexedDB fail to open, on every load. */
const refuseTransactionManagerIndexedDB = (page: Page) =>
  page.addInitScript((dbName) => {
    const open = IDBFactory.prototype.open
    IDBFactory.prototype.open = function (name: string, version?: number) {
      if (name === dbName)
        throw new DOMException(
          'A mutation operation was attempted on a database that did not allow mutations.',
          'InvalidStateError',
        )
      return open.call(this, name, version)
    }
  }, TX_DB_NAME)

const readHistory = (page: Page) =>
  page.evaluate((key) => {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as StoredTransaction[]) : null
  }, HISTORY_KEY)

/** Active-record keys: `tx-<id>`, the archive deliberately left out. */
const activeKeys = (page: Page) =>
  page.evaluate(
    (historyKey) =>
      Object.keys(localStorage)
        .filter((k) => k.startsWith('tx-') && k !== historyKey)
        .sort(),
    HISTORY_KEY,
  )

const storageType = (page: Page) =>
  page.evaluate((key) => localStorage.getItem(key), STORAGE_TYPE_KEY)

const backendAuthedAddress = (page: Page) =>
  page.evaluate((key) => {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    return (
      (JSON.parse(raw) as { context?: { address?: string } }).context
        ?.address ?? null
    )
  }, BACKEND_AUTH_KEY)

/**
 * Sign in to the backend as the connected account. `WalletLifecycle` only
 * clears transactions when the new address differs from the authed one, so
 * without this the switch below would not reach the bug at all.
 */
async function signInAs(page: Page, address: Address) {
  await signInBackendAuthModal(page)
  await expect
    .poll(() => backendAuthedAddress(page), {
      message: 'SIWE sign-in must record the connected address',
      timeout: 30_000,
    })
    .toBe(address)
}

/** Switch the wallet to `user2` with a real `accountsChanged`. */
async function switchToUser2(
  wallet: Web3ProviderBackend,
  accounts: PortalAccounts,
) {
  const key = accounts.getPrivateKey('user2')
  await wallet.changeAccounts([
    key,
    ...accounts.getAllPrivateKeys().filter((k) => k !== key),
  ])
}

const stored = (id: string, state = 'success'): StoredTransaction => ({
  id,
  state,
  context: null,
  timestamp: 1_700_000_000_000,
  updatedAt: 1_700_000_000_000,
})

test.describe('transaction history survives an account switch without IndexedDB (WEB-1223)', () => {
  test.describe.configure({ timeout: 300_000 })

  test('switching accounts clears active records but keeps the archive (the report repro)', {
    tag: ['@smoke'],
  }, async ({ page, wallet, accounts }) => {
    const user = accounts.getAddress('user') as Address
    const user2 = accounts.getAddress('user2') as Address
    await refuseTransactionManagerIndexedDB(page)

    await page.goto(MANAGER_APP_URL)
    const archived = [
      stored(`archived-a-${Date.now().toString(36)}`),
      stored(`archived-b-${Date.now().toString(36)}`),
    ]
    const active = [
      `active-a-${Date.now().toString(36)}`,
      `active-b-${Date.now().toString(36)}`,
    ]
    await page.evaluate(
      ({ historyKey, archived, active }) => {
        localStorage.setItem(historyKey, JSON.stringify(archived))
        for (const id of active)
          localStorage.setItem(
            `tx-${id}`,
            JSON.stringify({
              id,
              state: 'success',
              context: null,
              timestamp: 1,
              updatedAt: 1,
            }),
          )
      },
      { historyKey: HISTORY_KEY, archived, active },
    )

    await connectWithHeadlessWallet(page, wallet)
    await signInAs(page, user)
    // Precondition: nothing cleared yet.
    expect(await activeKeys(page)).toEqual(
      active.map((id) => `tx-${id}`).sort(),
    )
    expect(await readHistory(page)).toEqual(archived)

    await switchToUser2(wallet, accounts)

    // Positive control: the account-switch clear really ran. It signs the
    // backend out and removes the active records in the same effect, so the
    // archive check below is not passing on a clear that never happened.
    await expect
      .poll(() => backendAuthedAddress(page), {
        message: `WalletLifecycle should sign ${user} out after the switch to ${user2}`,
        timeout: 30_000,
      })
      .toBeNull()
    await expect
      .poll(() => activeKeys(page), {
        message: 'clearActive() should remove every tx-<id> record',
        timeout: 15_000,
      })
      .toEqual([])
    expect(await storageType(page)).toBe('localstorage')

    // The bug: `tx-history` matched the `tx-` scan and was deleted with them.
    expect(
      await readHistory(page),
      'the archive must survive clearing the active transactions',
    ).toEqual(archived)
  })

  test('a renewal archived by the app survives the switch to another account', async ({
    profileAuthenticatedPageWithBackend: page,
    makeV2Name,
    wallet,
    accounts,
  }) => {
    const user = accounts.getAddress('user') as Address
    // The fixture signed in over IndexedDB; from the reload on, this browser
    // behaves like Firefox private browsing for the transaction manager.
    await refuseTransactionManagerIndexedDB(page)
    const name = await makeV2Name({ label: 'txhistory' })
    const expiryBefore = await getExpiry(publicClient as never, { name })
    await page.reload()
    expect(await backendAuthedAddress(page)).toBe(user)
    expect(await readHistory(page)).toBeNull()

    await goToProfile(page, name)
    await page.getByRole('link', { name: /renew/i }).click()
    await page.waitForLoadState('networkidle')
    void authorizeTransaction(wallet, 120_000).catch(() => {})
    await renewFor28Days(page)

    // The app archives the finished renewal itself, on localStorage.
    await expect
      .poll(async () => (await readHistory(page))?.length ?? 0, {
        message: 'the finished renewal should be archived to tx-history',
        timeout: 15_000,
      })
      .toBeGreaterThan(0)
    expect(await storageType(page)).toBe('localstorage')
    const [entry] = (await readHistory(page)) ?? []
    expect(entry.state).toBe('success')
    expect(entry.hash).toMatch(/^0x[0-9a-f]{64}$/)
    // The archived hash must identify the renewal of this name. Smart-account
    // renewals can be submitted by a relayer, so receipt.from is not the owner.
    const receipt = await publicClient.getTransactionReceipt({
      hash: entry.hash as Hash,
    })
    expect(receipt.status).toBe('success')
    const transaction = await publicClient.getTransaction({
      hash: entry.hash as Hash,
    })
    expect(transaction.input).toContain(
      toHex(name.replace(/\.eth$/, '')).slice(2),
    )
    expect(transaction.input).toContain(
      toFunctionSelector('renew((string,uint64,bytes32),address)').slice(2),
    )
    expect(await getExpiry(publicClient as never, { name })).toBeGreaterThan(
      expiryBefore,
    )

    await switchToUser2(wallet, accounts)

    // Positive control: the switch reached clearAllAndPersistence().
    await expect
      .poll(() => backendAuthedAddress(page), {
        message: 'WalletLifecycle should sign the first account out',
        timeout: 30_000,
      })
      .toBeNull()

    const after = await readHistory(page)
    expect(
      after?.map((t) => ({ id: t.id, hash: t.hash })),
      'the renewal archived before the switch must still be in the history',
    ).toEqual([{ id: entry.id, hash: entry.hash }])
  })
})
