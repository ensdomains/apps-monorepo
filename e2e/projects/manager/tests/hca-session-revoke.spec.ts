/**
 * WEB-674 — on-chain revocation of standalone-HCA sessions (#1113).
 *
 * Bug: a session could only be "removed" from localStorage. The validator is
 * stateless — every session-signed intent carries the owner's authorization
 * inline and is checked against the account's CURRENT session nonce — so the
 * stored record IS the session, and a copy taken off the device kept working
 * until `validUntil`. Disconnect deliberately keeps sessions, so there was no
 * way to end one early.
 *
 * Fix: a wallet-menu entry (since #1480 "Reset smart session access") that
 * sends the owner's `StandaloneSingleOwnerHCA.revokeSessions()` transaction
 * (bumps the nonce, emits `SessionsRevoked`), clears this browser's record
 * only after the receipt carries that event, and — for an undeployed account,
 * whose sessions go live once anyone deploys it — offers deploy-then-revoke.
 * Since #1586 the reset also sends any USDC left in the HCA back to the wallet,
 * in a second owner transaction. These tests run the reset on an empty HCA, so
 * the revoke is the only transaction and the shared HCA keeps its balance.
 *
 * What these reach that the unit tests don't: the real menu and modal, a real
 * owner transaction mined on the fork, the HCA's real `onlyOwner` and nonce,
 * and the real factory deployment. The oracle for "a copied session is dead"
 * is the chain: the copy's `hcaSessionNonce` against `ownerAndSessionNonce()`.
 * The UI cannot be the oracle here — for a deployed HCA the mockestrator
 * impersonates the account and never runs the validator, so a revoked session
 * would still "register" locally.
 *
 * Revoking bumps the shared `user` HCA's nonce. That is harmless to other
 * specs: each browser signs a fresh session against the current nonce.
 */

import { ensL1Contracts, supportedL1Chains } from '@ensdomains/ensjs/chain'
import { Web3RequestKind } from '@ensdomains/headless-web3-provider'
import { expect, type Page } from '@playwright/test'
import {
  type Address,
  type Hex,
  isAddressEqual,
  parseAbi,
  parseEther,
  parseEventLogs,
} from 'viem'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'
import { getDestinationContracts } from '../../../../packages/smart-account/src/providers/rhinestone/manifest.ts'
import { test } from '../../../fixtures/playwright.manager.fixture.js'
import {
  publicClient,
  testClient,
  walletClient,
} from '../../../helpers/anvil-client.js'
import { fundTestUsdc, readTestUsdc } from '../../../helpers/fund-test-usdc.js'
import {
  connectWithHeadlessWallet,
  dismissBackendAuthModal,
} from '../../../helpers/manager-auth.js'
import {
  type PortalAccounts,
  switchWalletToUndeclaredChain,
} from '../../../helpers/portal-auth.js'

type Wallet = Parameters<typeof switchWalletToUndeclaredChain>[1]

const MANAGER_URL = process.env.MANAGER_APP_URL ?? 'http://localhost:3000'
/** The app bumps the version on a breaking change; the newest key is live. */
const SESSION_STORAGE_KEY = /^ens-sessions-v(\d+)$/
const HCA_FACTORY = ensL1Contracts[supportedL1Chains.sepolia].ensHcaFactory
  .address as Address
/** `revokeSessions()` — computed independently with `cast sig`. */
const REVOKE_SESSIONS_SELECTOR = '0xac2d5d4b'

const hcaAbi = parseAbi([
  'function ownerAndSessionNonce() view returns (address owner, uint96 sessionNonce)',
  'event SessionsRevoked(uint96 indexed sessionNonce)',
])

const hcaFactoryAbi = parseAbi([
  'function deploy(address owner, address hcaImplementation, uint256 userSalt) returns (address hca)',
])
/**
 * The implementation the factory approves. ensjs doesn't export it and the
 * factory has no getter for it, so read it from the app's own manifest: the
 * test then follows every redeploy the app follows. `ensureHcaDeployed` also
 * checks the deployed address against the app's HCA.
 */
const HCA_IMPLEMENTATION = getDestinationContracts(
  supportedL1Chains.sepolia,
).standaloneHcaImplementation

type StoredSession = {
  readonly smartAccountAddress: Address
  readonly ownerAddress: Address
  readonly hcaSessionNonce: string
}

const readOwnerAndNonce = async (hca: Address) => {
  const [owner, nonce] = await publicClient.readContract({
    address: hca,
    abi: hcaAbi,
    functionName: 'ownerAndSessionNonce',
  })
  return { owner, nonce }
}

const hasCode = async (address: Address) => {
  const code = await publicClient.getCode({ address })
  return Boolean(code && code !== '0x')
}

/**
 * Deploy the owner's HCA if it has no code. A fresh fork starts with the
 * shared `user` HCA counterfactual, and the deployed-account tests must not
 * depend on another spec having registered first. Deployment is
 * permissionless and leaves the session nonce at 0, so a session signed
 * before it stays valid.
 */
const ensureHcaDeployed = async (
  hca: Address,
  owner: Address,
  accounts: PortalAccounts,
) => {
  if (await hasCode(hca)) return
  const account = privateKeyToAccount(accounts.getPrivateKey('user'))
  const { result, request } = await publicClient.simulateContract({
    account,
    address: HCA_FACTORY,
    abi: hcaFactoryAbi,
    functionName: 'deploy',
    args: [owner, HCA_IMPLEMENTATION, 0n],
  })
  expect(isAddressEqual(result, hca)).toBe(true)
  const hash = await walletClient.writeContract(request)
  await publicClient.waitForTransactionReceipt({ hash })
  expect(await hasCode(hca)).toBe(true)
}

const readStoredSessions = async (page: Page): Promise<StoredSession[]> =>
  JSON.parse(
    (await page.evaluate((pattern) => {
      const key = Object.keys(localStorage)
        .filter((k) => new RegExp(pattern).test(k))
        .sort(
          (a, b) =>
            Number(new RegExp(pattern).exec(b)?.[1]) -
            Number(new RegExp(pattern).exec(a)?.[1]),
        )[0]
      return key ? localStorage.getItem(key) : null
    }, SESSION_STORAGE_KEY.source)) ?? '[]',
  )

const storedSessionFor = async (page: Page, hca: Address) =>
  (await readStoredSessions(page)).find((s) =>
    isAddressEqual(s.smartAccountAddress, hca),
  )

/**
 * Transactions `from` sent that were mined after `fromBlock`, oldest first.
 * Scoped to one sender: the fork is shared, so unrelated traffic is expected.
 */
const minedTxsSince = async (fromBlock: bigint, from: Address) => {
  // viem caches the block number for ~4s; a stale head would miss the tx.
  const head = await publicClient.getBlockNumber({ cacheTime: 0 })
  const txs = []
  for (let n = fromBlock + 1n; n <= head; n++) {
    const block = await publicClient.getBlock({
      blockNumber: n,
      includeTransactions: true,
    })
    txs.push(
      ...block.transactions.filter((tx) => isAddressEqual(tx.from, from)),
    )
  }
  return txs
}

const revokedNonceIn = async (hash: Hex, hca: Address) => {
  const receipt = await publicClient.getTransactionReceipt({ hash })
  const [event] = parseEventLogs({
    abi: hcaAbi,
    eventName: 'SessionsRevoked',
    logs: receipt.logs.filter((log) => isAddressEqual(log.address, hca)),
  })
  return event?.args.sessionNonce
}

const waitForPendingTx = (wallet: Wallet) =>
  expect
    .poll(
      () => wallet.getPendingRequestCount(Web3RequestKind.SendTransaction),
      {
        timeout: 20_000,
      },
    )
    .toBeGreaterThanOrEqual(1)

/** Sign a session from the wallet menu's "Enable smart sessions" (#1480). */
const enableSessionFromMenu = async (page: Page, owner: Address) => {
  await openAccountMenu(page)
  await page.getByRole('button', { name: 'Enable smart sessions' }).click()
  await expect
    .poll(async () =>
      (await readStoredSessions(page)).find((s) =>
        isAddressEqual(s.ownerAddress, owner),
      ),
    )
    .toBeTruthy()
  const session = (await readStoredSessions(page)).find((s) =>
    isAddressEqual(s.ownerAddress, owner),
  ) as StoredSession
  await page.keyboard.press('Escape')
  return session
}

/**
 * The account trigger's label varies (truncated owner, primary name, or
 * "Connected" on an undeclared chain) and so does its avatar alt, but it is
 * always an avatar "pattern" plus the chevron; the dashboard's sort menu has
 * only the chevron.
 */
const openAccountMenu = async (page: Page) => {
  await page
    .getByRole('button', { name: /\bpattern\b.*keyboard_arrow_down$/ })
    .click()
  await expect(page.getByRole('button', { name: /Disconnect/ })).toBeVisible()
}

const RESET_ENTRY = 'Reset smart session access'

const openRevokeDialog = async (page: Page) => {
  await openAccountMenu(page)
  await page.getByRole('button', { name: RESET_ENTRY }).click()
  const dialog = page.getByRole('dialog', { name: RESET_ENTRY })
  await expect(dialog).toBeVisible()
  return dialog
}

/**
 * Run `body` with the HCA's USDC at zero, then put it back. The reset returns
 * a leftover in a second transaction, and the shared `user` HCA holds CI's
 * 10,000 USDC, which other specs pay from.
 */
const withEmptyHca = async (hca: Address, body: () => Promise<void>) => {
  const original = await readTestUsdc(hca)
  await fundTestUsdc(hca, 0n)
  try {
    await body()
  } finally {
    await fundTestUsdc(hca, original)
  }
}

/** Connect a never-used owner, so its HCA is counterfactual (no code). */
const connectFreshOwner = async (
  page: Page,
  wallet: Wallet,
  accounts: PortalAccounts,
) => {
  const key = generatePrivateKey()
  const owner = privateKeyToAccount(key).address
  await testClient.setBalance({ address: owner, value: parseEther('10') })
  await page.goto(MANAGER_URL)
  // The provider only exists once the page has loaded.
  await wallet.changeAccounts([key, ...accounts.getAllPrivateKeys()])
  await connectWithHeadlessWallet(page, wallet)
  await dismissBackendAuthModal(page)
  return owner
}

test.describe('reset smart session access on-chain (WEB-674)', () => {
  test('resetting a deployed account bumps the nonce, kills a copied session, and clears this browser', async ({
    connectedPage: page,
    wallet,
    accounts,
  }) => {
    const owner = accounts.getAddress('user') as Address
    // A copy of the record, as an attacker would take it off the device.
    const copied = await enableSessionFromMenu(page, owner)
    const hca = copied.smartAccountAddress
    await ensureHcaDeployed(hca, owner, accounts)
    const before = await readOwnerAndNonce(hca)
    expect(isAddressEqual(before.owner, owner)).toBe(true)
    // Precondition: the copy is live — signed against the current nonce.
    expect(BigInt(copied.hcaSessionNonce)).toBe(before.nonce)

    await withEmptyHca(hca, async () => {
      const dialog = await openRevokeDialog(page)
      await expect(dialog).toContainText('across every browser and device')
      await expect(dialog).toContainText('ETH for gas')
      const fromBlock = await publicClient.getBlockNumber({ cacheTime: 0 })
      await dialog.getByRole('button', { name: 'Reset access' }).click()
      await waitForPendingTx(wallet)
      await wallet.authorize(Web3RequestKind.SendTransaction)
      await expect(dialog).toBeHidden({ timeout: 30_000 })

      // Exactly one transaction: the owner calling revokeSessions() on its HCA.
      const txs = await minedTxsSince(fromBlock, owner)
      expect(txs).toHaveLength(1)
      const [tx] = txs
      expect(isAddressEqual(tx.from, owner)).toBe(true)
      expect(tx.to && isAddressEqual(tx.to, hca)).toBe(true)
      expect(tx.input).toBe(REVOKE_SESSIONS_SELECTOR)
      expect(await revokedNonceIn(tx.hash, hca)).toBe(before.nonce + 1n)
    })

    const after = await readOwnerAndNonce(hca)
    expect(after.nonce).toBe(before.nonce + 1n)
    // The copied record no longer matches the nonce the validator checks.
    expect(BigInt(copied.hcaSessionNonce)).not.toBe(after.nonce)
    expect(await storedSessionFor(page, hca)).toBeUndefined()
    // Nothing is left to revoke until a new session is signed.
    await openAccountMenu(page)
    await expect(
      page.getByRole('button', { name: 'Smart session access reset' }),
    ).toBeDisabled()
    await page.keyboard.press('Escape')

    // Positive control: a new session is signed against the bumped nonce, and
    // the reset is offered again — the legitimate path still works.
    const fresh = await enableSessionFromMenu(page, owner)
    expect(BigInt(fresh.hcaSessionNonce)).toBe(after.nonce)
    await openAccountMenu(page)
    await expect(page.getByRole('button', { name: RESET_ENTRY })).toBeEnabled()
  })

  test('a rejected reset keeps the session and the dialog; Try Again then revokes', async ({
    connectedPage: page,
    wallet,
    accounts,
  }) => {
    const owner = accounts.getAddress('user') as Address
    const session = await enableSessionFromMenu(page, owner)
    const hca = session.smartAccountAddress
    await ensureHcaDeployed(hca, owner, accounts)
    const before = await readOwnerAndNonce(hca)

    await withEmptyHca(hca, async () => {
      const dialog = await openRevokeDialog(page)
      await dialog.getByRole('button', { name: 'Reset access' }).click()
      await waitForPendingTx(wallet)
      await wallet.reject(Web3RequestKind.SendTransaction)

      await expect(dialog).toContainText("Couldn't revoke sessions")
      await expect(
        dialog.getByRole('button', { name: 'Try Again' }),
      ).toBeVisible()
      expect((await readOwnerAndNonce(hca)).nonce).toBe(before.nonce)
      // Storage is cleared only after a confirmed revoke, never before.
      expect(await storedSessionFor(page, hca)).toBeTruthy()

      await dialog.getByRole('button', { name: 'Try Again' }).click()
      await waitForPendingTx(wallet)
      await wallet.authorize(Web3RequestKind.SendTransaction)
      await expect(dialog).toBeHidden({ timeout: 30_000 })
    })
    expect((await readOwnerAndNonce(hca)).nonce).toBe(before.nonce + 1n)
    expect(await storedSessionFor(page, hca)).toBeUndefined()
  })

  // App bug found while rewriting for WEB-2110 (2026-11-02), not yet filed:
  // off its chain the manager keeps offering the reset, and a live switch
  // lets "Reset access" send a transaction to the wallet on the wrong chain.
  // Lands on main with the bug's ID.
  test.fail(
    'loaded on another chain, the menu hides the reset entry',
    async ({ connectedPage: page, wallet }) => {
      // Guard: loaded off its chain, the smart-account context has no HCA, so
      // there is nothing to revoke for. A live switch keeps the HCA (and the
      // entry) — that case is the next test. Positive control on Sepolia first.
      const resetEntry = page.getByRole('button', { name: RESET_ENTRY })
      await openAccountMenu(page)
      await expect(resetEntry).toBeVisible()
      await page.keyboard.press('Escape')

      await switchWalletToUndeclaredChain(page, wallet)
      await page.goto(MANAGER_URL)
      // The reloaded page is on the foreign chain. (The trigger label is no
      // signal: it shows the primary name once another spec has set one.)
      await expect
        .poll(() =>
          page.evaluate(() =>
            (
              window as Window & {
                ethereum?: { request: (a: { method: string }) => unknown }
              }
            ).ethereum?.request({ method: 'eth_chainId' }),
          ),
        )
        .toBe('0x1')
      // Absent once the menu has rendered (Disconnect), and still absent after
      // a settle window — not just before the account has loaded. On Sepolia
      // the entry appears well within it.
      await openAccountMenu(page)
      await expect(resetEntry).toHaveCount(0)
      await page.keyboard.press('Escape')
      await page.waitForTimeout(5_000)
      await openAccountMenu(page)
      await expect(resetEntry).toHaveCount(0)
    },
  )

  // App bug found while rewriting for WEB-2110 (2026-11-02), not yet filed:
  // off its chain the manager keeps offering the reset, and a live switch
  // lets "Reset access" send a transaction to the wallet on the wrong chain.
  // Lands on main with the bug's ID.
  test.fail(
    'a live chain switch with the dialog open sends nothing and leaves sessions live',
    async ({ connectedPage: page, wallet, accounts }) => {
      const owner = accounts.getAddress('user') as Address
      const session = await enableSessionFromMenu(page, owner)
      const hca = session.smartAccountAddress
      await ensureHcaDeployed(hca, owner, accounts)
      const before = await readOwnerAndNonce(hca)

      await withEmptyHca(hca, async () => {
        const dialog = await openRevokeDialog(page)
        await switchWalletToUndeclaredChain(page, wallet)
        const fromBlock = await publicClient.getBlockNumber({ cacheTime: 0 })
        await dialog.getByRole('button', { name: 'Reset access' }).click()

        // Wait for the failure to land before checking nothing was sent.
        await expect(
          dialog.getByRole('button', { name: 'Try Again' }),
        ).toBeVisible()
        await expect(dialog).toContainText('Switch your wallet to')
        expect(
          wallet.getPendingRequestCount(Web3RequestKind.SendTransaction),
        ).toBe(0)
        expect(await minedTxsSince(fromBlock, owner)).toHaveLength(0)
      })
      expect((await readOwnerAndNonce(hca)).nonce).toBe(before.nonce)
      expect(await storedSessionFor(page, hca)).toBeTruthy()
    },
  )

  test('an undeployed account offers set-up-and-reset, sends nothing until confirmed, then deploys and revokes in order', async ({
    page,
    wallet,
    accounts,
  }) => {
    const owner = await connectFreshOwner(page, wallet, accounts)
    const copied = await enableSessionFromMenu(page, owner)
    const hca = copied.smartAccountAddress
    expect(await hasCode(hca)).toBe(false)
    // Signed against nonce 0: live the moment anyone deploys the account.
    expect(copied.hcaSessionNonce).toBe('0')
    // A never-used owner's HCA holds nothing, so no withdrawal follows.
    expect(await readTestUsdc(hca)).toBe(0n)

    const dialog = await openRevokeDialog(page)
    const fromBlock = await publicClient.getBlockNumber({ cacheTime: 0 })
    await dialog.getByRole('button', { name: 'Reset access' }).click()

    // Not a quiet local-only "success": the dialog stays and explains.
    await expect(dialog).toContainText("isn't set up on-chain yet")
    await expect(dialog).toContainText('two transactions')
    const setUpAndReset = dialog.getByRole('button', {
      name: 'Set up and reset access',
    })
    await expect(setUpAndReset).toBeVisible()
    expect(wallet.getPendingRequestCount(Web3RequestKind.SendTransaction)).toBe(
      0,
    )
    expect(await minedTxsSince(fromBlock, owner)).toHaveLength(0)
    expect(await storedSessionFor(page, hca)).toBeTruthy()

    await setUpAndReset.click()
    for (let i = 0; i < 2; i++) {
      await waitForPendingTx(wallet)
      await wallet.authorize(Web3RequestKind.SendTransaction)
    }
    await expect(dialog).toBeHidden({ timeout: 30_000 })

    const [deploy, revoke, ...rest] = await minedTxsSince(fromBlock, owner)
    expect(rest).toHaveLength(0)
    // 1) the owner deploys through the factory, 2) the owner revokes.
    expect(isAddressEqual(deploy.from, owner)).toBe(true)
    expect(deploy.to && isAddressEqual(deploy.to, HCA_FACTORY)).toBe(true)
    expect(isAddressEqual(revoke.from, owner)).toBe(true)
    expect(revoke.to && isAddressEqual(revoke.to, hca)).toBe(true)
    expect(revoke.input).toBe(REVOKE_SESSIONS_SELECTOR)

    expect(await hasCode(hca)).toBe(true)
    const after = await readOwnerAndNonce(hca)
    expect(isAddressEqual(after.owner, owner)).toBe(true)
    expect(after.nonce).toBe(1n)
    expect(await revokedNonceIn(revoke.hash, hca)).toBe(1n)
    expect(BigInt(copied.hcaSessionNonce)).not.toBe(after.nonce)
    expect(await storedSessionFor(page, hca)).toBeUndefined()
  })
})
