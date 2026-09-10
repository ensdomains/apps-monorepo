/**
 * Multi-wallet fixture — plan item H3.
 *
 * Every authorization negative case needs at least two identities: one that
 * holds a role and one that does not. This turns the four Anvil accounts the
 * fixtures already derive into named participants and lets a test move between
 * them mid-flight.
 *
 * The switch is a real `accountsChanged` event, not a page reload. That
 * matters: reloading would hide exactly the bug these tests exist to catch —
 * a UI that keeps showing the previous account's affordances because a query
 * was never invalidated (`useResetMutationsOnAccountChange`, scenario J2).
 */

import { ensL1Contracts, supportedL1Chains } from '@ensdomains/ensjs/chain'
import type { Web3ProviderBackend } from '@ensdomains/headless-web3-provider'
import type { Page } from '@playwright/test'
import { type Address, encodeFunctionData, type Hash, parseAbi } from 'viem'
import { type PrivateKeyAccount, privateKeyToAccount } from 'viem/accounts'
import {
  publicClient,
  testClient,
  walletClient,
} from '../helpers/anvil-client.js'
import type { User } from './playwright.portal.fixture.js'

const ensjsSepolia = ensL1Contracts[supportedL1Chains.sepolia]
const MOCK_USDC = ensjsSepolia.usdc.address

const ERC20_ABI = parseAbi([
  'function mint(address to, uint256 amount)',
  'function balanceOf(address owner) view returns (uint256)',
])

const ANVIL_FUNDER = privateKeyToAccount(
  '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
)

const MIN_ETH = 10_000_000_000_000_000n // 0.01 ETH
const TOP_UP_ETH = 100_000_000_000_000_000n // 0.1 ETH
const MIN_USDC = 1_000_000_000n // 1 000 USDC
const TOP_UP_USDC = 10_000_000_000n // 10 000 USDC

/**
 * The three participants every authorization scenario is written against.
 * They are aliases over the existing `user`/`user2`/`user3` accounts so that a
 * spec reads as the rule it is testing rather than as an account index.
 */
export const ROLES = {
  /** Holds the name and its full role set. */
  owner: 'user',
  /** Granted a specific role under test — never the owner. */
  manager: 'user2',
  /** Holds nothing. The negative case in every §5.C/§5.D/§5.E scenario. */
  stranger: 'user3',
} as const satisfies Record<string, User>

export type Participant = keyof typeof ROLES

export interface AccountsApi {
  getAddress: (user?: User) => Address
  getPrivateKey: (user?: User) => Hash
  getAllPrivateKeys: () => Hash[]
}

export interface Wallets {
  /** Address of a participant (or a raw user slot). */
  address: (who: Participant | User) => Address
  /**
   * Signing account for a participant — for fixtures that write directly.
   *
   * `PrivateKeyAccount`, not the wider `Account` union, because that is
   * exactly what this returns. Fixtures that take a signer (`makeV1Name`,
   * `makeSubname`, …) declare a non-optional `sign`, which `Account` and even
   * `LocalAccount` leave optional — so the wider type made every such call
   * site an error once ensjs narrowed its signer types.
   */
  account: (who: Participant | User) => PrivateKeyAccount
  /**
   * Make `who` the connected account, without a reload. Resolves once the
   * provider has emitted `accountsChanged`; the app still needs its own beat
   * to re-render, so assert on the UI rather than on this returning.
   */
  switchTo: (who: Participant | User) => Promise<Address>
  /** The participant currently connected. */
  current: () => Participant | User
  /** Top up ETH and USDC for `who` — idempotent. */
  fund: (who: Participant | User) => Promise<void>
}

const resolveUser = (who: Participant | User): User =>
  who in ROLES ? ROLES[who as Participant] : (who as User)

export function createWallets({
  wallet,
  accounts,
  page,
}: {
  wallet: Web3ProviderBackend
  accounts: AccountsApi
  page: Page
}): Wallets {
  let connected: Participant | User = 'owner'

  const address = (who: Participant | User) =>
    accounts.getAddress(resolveUser(who))

  const account = (who: Participant | User) =>
    privateKeyToAccount(accounts.getPrivateKey(resolveUser(who)))

  const fund = async (who: Participant | User) => {
    const to = address(who)
    // Anvil's default mnemonic is public, so live Sepolia bots may have left
    // 7702 delegation bytecode on these addresses; the fork inherits it and it
    // breaks ERC-1155 receipt. Same reason as the portal fixture's clear.
    await testClient.setCode({ address: to, bytecode: '0x' })

    const [eth, usdc] = await Promise.all([
      publicClient.getBalance({ address: to }),
      publicClient.readContract({
        address: MOCK_USDC,
        abi: ERC20_ABI,
        functionName: 'balanceOf',
        args: [to],
      }),
    ])

    if (eth < MIN_ETH) {
      const hash = await walletClient.sendTransaction({
        account: ANVIL_FUNDER,
        to,
        value: TOP_UP_ETH,
      })
      await publicClient.waitForTransactionReceipt({ hash })
    }

    if (usdc < MIN_USDC) {
      const hash = await walletClient.sendTransaction({
        account: ANVIL_FUNDER,
        to: MOCK_USDC,
        data: encodeFunctionData({
          abi: ERC20_ABI,
          functionName: 'mint',
          args: [to, TOP_UP_USDC],
        }),
      })
      await publicClient.waitForTransactionReceipt({ hash })
    }
  }

  const switchTo = async (who: Participant | User) => {
    const user = resolveUser(who)
    const target = accounts.getAddress(user)
    await fund(who)

    // The provider treats the head of the list as the selected account, so
    // reorder rather than truncate — the others must stay available or the app
    // sees a disconnect instead of a switch.
    const targetKey = accounts.getPrivateKey(user)
    const rest = accounts.getAllPrivateKeys().filter((key) => key !== targetKey)
    await wallet.changeAccounts([targetKey, ...rest])

    // `accountsChanged` is dispatched into the page; give the app's wagmi
    // connector a turn of the event loop to pick it up before the caller
    // starts asserting.
    await page.evaluate(() => new Promise((r) => setTimeout(r, 0)))

    connected = who
    return target
  }

  return { address, account, switchTo, current: () => connected, fund }
}
