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
 * Fix: a "Revoke smart sessions" wallet-menu entry that sends the owner's
 * `StandaloneSingleOwnerHCA.revokeSessions()` transaction (bumps the nonce,
 * emits `SessionsRevoked`), clears this browser's record only after the
 * receipt carries that event, and — for an undeployed account, whose sessions
 * go live once anyone deploys it — offers deploy-then-revoke.
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
import {
  clickThroughEnableSessions,
  connectWithHeadlessWallet,
  dismissBackendAuthModal,
} from '../../../helpers/manager-auth.js'
import {
  type PortalAccounts,
  switchWalletToUndeclaredChain,
} from '../../../helpers/portal-auth.js'
import { findSearchInput } from '../../../helpers/search-input.js'

type Wallet = Parameters<typeof switchWalletToUndeclaredChain>[1]

const MANAGER_URL = process.env.MANAGER_APP_URL ?? 'http://localhost:3000'
const SESSION_STORAGE_KEY = 'ens-sessions-v9'
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
    (await page.evaluate(
      (key) => localStorage.getItem(key),
      SESSION_STORAGE_KEY,
    )) ?? '[]',
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

/** Sign a session through the real registration gate (the only UI entry). */
const enableSessionViaGate = async (page: Page, owner: Address) => {
  const label = `rvk-${Date.now().toString(36)}`
  const search = await findSearchInput(page)
  await search.click()
  await search.fill(label)
  await page.getByText('Available').first().waitFor({ timeout: 15_000 })
  await page.getByText(`${label}.eth`).first().click()
  await page.getByRole('button', { name: /pay with stablecoins/i }).click()
  await clickThroughEnableSessions(page)
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
  await page.goto(MANAGER_URL)
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

const openRevokeDialog = async (page: Page) => {
  await openAccountMenu(page)
  await page.getByRole('button', { name: 'Revoke smart sessions' }).click()
  const dialog = page.getByRole('dialog', { name: 'Revoke smart sessions' })
  await expect(dialog).toBeVisible()
  return dialog
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

test.describe('revoke smart sessions on-chain (WEB-674)', () => {
  test('revoking a deployed account bumps the nonce, kills a copied session, and clears this browser', {
    tag: ['@smoke'],
  }, async ({ connectedPage: page, wallet, accounts }) => {
    const owner = accounts.getAddress('user') as Address
    // A copy of the record, as an attacker would take it off the device.
    const copied = await enableSessionViaGate(page, owner)
    const hca = copied.smartAccountAddress
    await ensureHcaDeployed(hca, owner, accounts)
    const before = await readOwnerAndNonce(hca)
    expect(isAddressEqual(before.owner, owner)).toBe(true)
    // Precondition: the copy is live — signed against the current nonce.
    expect(BigInt(copied.hcaSessionNonce)).toBe(before.nonce)

    const dialog = await openRevokeDialog(page)
    await expect(dialog).toContainText('in every browser and on every device')
    await expect(dialog).toContainText('costs gas')
    const fromBlock = await publicClient.getBlockNumber({ cacheTime: 0 })
    await dialog.getByRole('button', { name: 'Revoke sessions' }).click()
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

    const after = await readOwnerAndNonce(hca)
    expect(after.nonce).toBe(before.nonce + 1n)
    expect(await revokedNonceIn(tx.hash, hca)).toBe(after.nonce)
    // The copied record no longer matches the nonce the validator checks.
    expect(BigInt(copied.hcaSessionNonce)).not.toBe(after.nonce)
    expect(await storedSessionFor(page, hca)).toBeUndefined()

    // Positive control: the gate re-prompts, and the new session is signed
    // against the bumped nonce — the legitimate path still works.
    const fresh = await enableSessionViaGate(page, owner)
    expect(BigInt(fresh.hcaSessionNonce)).toBe(after.nonce)
  })

  test('a rejected revoke keeps the session and the dialog; Try Again then revokes', async ({
    connectedPage: page,
    wallet,
    accounts,
  }) => {
    const owner = accounts.getAddress('user') as Address
    const session = await enableSessionViaGate(page, owner)
    const hca = session.smartAccountAddress
    await ensureHcaDeployed(hca, owner, accounts)
    const before = await readOwnerAndNonce(hca)

    const dialog = await openRevokeDialog(page)
    await dialog.getByRole('button', { name: 'Revoke sessions' }).click()
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
    expect((await readOwnerAndNonce(hca)).nonce).toBe(before.nonce + 1n)
    expect(await storedSessionFor(page, hca)).toBeUndefined()
  })

  test('loaded on another chain, the menu hides the revoke entry', async ({
    connectedPage: page,
    wallet,
  }) => {
    // Guard: loaded off its chain, the smart-account context has no HCA, so
    // there is nothing to revoke for. A live switch keeps the HCA (and the
    // entry) — that case is the next test. Positive control on Sepolia first.
    const revokeEntry = page.getByRole('button', {
      name: 'Revoke smart sessions',
    })
    await openAccountMenu(page)
    await expect(revokeEntry).toBeVisible()
    await page.keyboard.press('Escape')

    await switchWalletToUndeclaredChain(page, wallet)
    await page.goto(MANAGER_URL)
    // The reloaded page is on the foreign chain. (The trigger label is no
    // signal: it shows the primary name once another spec has set one.)
    await expect
      .poll(() =>
        page.evaluate(() =>
          (
            window as unknown as {
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
    await expect(revokeEntry).toHaveCount(0)
    await page.keyboard.press('Escape')
    await page.waitForTimeout(5_000)
    await openAccountMenu(page)
    await expect(revokeEntry).toHaveCount(0)
  })

  test('a live chain switch with the dialog open sends nothing and leaves sessions live', async ({
    connectedPage: page,
    wallet,
    accounts,
  }) => {
    const owner = accounts.getAddress('user') as Address
    const session = await enableSessionViaGate(page, owner)
    const hca = session.smartAccountAddress
    await ensureHcaDeployed(hca, owner, accounts)
    const before = await readOwnerAndNonce(hca)

    const dialog = await openRevokeDialog(page)
    await switchWalletToUndeclaredChain(page, wallet)
    const fromBlock = await publicClient.getBlockNumber({ cacheTime: 0 })
    await dialog.getByRole('button', { name: 'Revoke sessions' }).click()

    // Wait for the failure to land before checking nothing was sent.
    await expect(
      dialog.getByRole('button', { name: 'Try Again' }),
    ).toBeVisible()
    await expect(dialog.locator('p.text-red-600')).toBeVisible()
    expect(wallet.getPendingRequestCount(Web3RequestKind.SendTransaction)).toBe(
      0,
    )
    expect(await minedTxsSince(fromBlock, owner)).toHaveLength(0)
    expect((await readOwnerAndNonce(hca)).nonce).toBe(before.nonce)
    expect(await storedSessionFor(page, hca)).toBeTruthy()
  })

  test('an undeployed account offers set-up-and-revoke, sends nothing until confirmed, then deploys and revokes in order', async ({
    page,
    wallet,
    accounts,
  }) => {
    const owner = await connectFreshOwner(page, wallet, accounts)
    const copied = await enableSessionViaGate(page, owner)
    const hca = copied.smartAccountAddress
    expect(await hasCode(hca)).toBe(false)
    // Signed against nonce 0: live the moment anyone deploys the account.
    expect(copied.hcaSessionNonce).toBe('0')

    const dialog = await openRevokeDialog(page)
    const fromBlock = await publicClient.getBlockNumber({ cacheTime: 0 })
    await dialog.getByRole('button', { name: 'Revoke sessions' }).click()

    // Not a quiet local-only "success": the dialog stays and explains.
    await expect(dialog).toContainText("isn't set up on-chain yet")
    await expect(dialog).toContainText('two transactions')
    const setUpAndRevoke = dialog.getByRole('button', {
      name: 'Set up and revoke',
    })
    await expect(setUpAndRevoke).toBeVisible()
    expect(wallet.getPendingRequestCount(Web3RequestKind.SendTransaction)).toBe(
      0,
    )
    expect(await minedTxsSince(fromBlock, owner)).toHaveLength(0)
    expect(await storedSessionFor(page, hca)).toBeTruthy()

    await setUpAndRevoke.click()
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

  test('on an undeployed account, "Remove saved session" clears only this browser and touches no chain', async ({
    page,
    wallet,
    accounts,
  }) => {
    const owner = await connectFreshOwner(page, wallet, accounts)

    // Negative control first: with no saved session there is nothing to
    // forget, so only set-up-and-revoke is offered.
    let dialog = await openRevokeDialog(page)
    await dialog.getByRole('button', { name: 'Revoke sessions' }).click()
    await expect(
      dialog.getByRole('button', { name: 'Set up and revoke' }),
    ).toBeVisible()
    await expect(
      dialog.getByRole('button', { name: 'Remove saved session' }),
    ).toHaveCount(0)
    await dialog.getByRole('button', { name: 'Cancel' }).click()
    await page.keyboard.press('Escape')

    const session = await enableSessionViaGate(page, owner)
    const hca = session.smartAccountAddress
    dialog = await openRevokeDialog(page)
    const fromBlock = await publicClient.getBlockNumber({ cacheTime: 0 })
    await dialog.getByRole('button', { name: 'Revoke sessions' }).click()
    await expect(dialog).toContainText("doesn't stop a copy made elsewhere")
    await dialog.getByRole('button', { name: 'Remove saved session' }).click()
    await expect(dialog).toBeHidden()

    expect(await storedSessionFor(page, hca)).toBeUndefined()
    expect(wallet.getPendingRequestCount(Web3RequestKind.SendTransaction)).toBe(
      0,
    )
    expect(await minedTxsSince(fromBlock, owner)).toHaveLength(0)
    expect(await hasCode(hca)).toBe(false)
  })
})
