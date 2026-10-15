/**
 * Cross-app fixture (HW7): the explorer (portal) and the manager side by
 * side, each in its own browser context with its own headless wallet, so a
 * test can change state in one app and observe it in the other — from the
 * actor's side and from the other people the change touches
 * (e2e-gap-analysis.md §5 rule 1).
 *
 * - `explorer` / `manager`: connected as `user` (Anvil account 0). Switch
 *   either to another account with `asAccount(app, 'user3')`.
 * - `accounts`, `makeV2Name`: as in the manager fixture.
 *
 * Needs both apps against the same local stack, without the mock wallet
 * (the headless connect flow needs the Connect button):
 *   PORTAL_APP_URL (default http://localhost:3001), MANAGER_APP_URL
 *   (default http://localhost:3000), E2E_MOCK_INDEXER=false.
 */

import { ensL1Contracts, supportedL1Chains } from '@ensdomains/ensjs/chain'
import { labelToCanonicalId } from '@ensdomains/ensjs/utils/v2'
import {
  injectHeadlessWeb3Provider,
  type Web3ProviderBackend,
} from '@ensdomains/headless-web3-provider'
import { test as base, type Page } from '@playwright/test'
import type { Address } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'

import { waitForBignameName } from '../helpers/bigname-sync.js'
import {
  waitForIndexedRoles,
  waitForRoleHolder,
} from '../helpers/indexer-sync.js'
import {
  dismissBackendAuthModal,
  PERMITTED_SIGN_KINDS,
} from '../helpers/manager-auth.js'
import {
  connectWithHeadlessWallet as connectExplorer,
  type PortalAccounts,
} from '../helpers/portal-auth.js'
import { createMakeV2Name, type V2NameConfig } from './makeV2Name.js'
import {
  connectHeadless as connectManager,
  createAccounts,
  localSepolia,
  overrideManagerFeatureFlags,
  PROFILE_FEATURE_FLAGS,
  waitForManagerFeatureFlagOverride,
} from './playwright.manager.fixture.js'
import { clearAnvilSquattedCode } from './playwright.portal.fixture.js'
import { createTime } from './time.js'

export const PORTAL_APP_URL =
  process.env.PORTAL_APP_URL ?? 'http://localhost:3001'
export const MANAGER_APP_URL =
  process.env.MANAGER_APP_URL ?? 'http://localhost:3000'

const ETH_REGISTRY = ensL1Contracts[supportedL1Chains.sepolia].ensRegistry
  .address as Address

type User = 'user' | 'user2' | 'user3' | 'user4'
const USERS: readonly User[] = ['user', 'user2', 'user3', 'user4']

/** One app open in its own context, with the wallet that drives it. */
export type AppSession = {
  readonly page: Page
  readonly wallet: Web3ProviderBackend
}

type CrossAppFixtures = {
  accounts: PortalAccounts
  explorer: AppSession
  manager: AppSession
  makeV2Name: (config: V2NameConfig) => Promise<string>
}

export const test = base.extend<CrossAppFixtures>({
  accounts: async ({}, use) => {
    const accounts = createAccounts()
    // Every well-known Anvil account carries a 7702 delegation on Sepolia
    // that refuses ERC-1155 tokens; clear them all so any can receive a name.
    await Promise.all(
      USERS.map((user) => clearAnvilSquattedCode(accounts.getAddress(user))),
    )
    await use(accounts)
  },

  explorer: async ({ browser, accounts }, use) => {
    const context = await browser.newContext()
    const page = await context.newPage()
    const wallet = await injectHeadlessWeb3Provider({
      page,
      privateKeys: accounts.getAllPrivateKeys(),
      chains: [localSepolia],
    })
    await page.goto(PORTAL_APP_URL)
    await connectExplorer(page, wallet)
    await use({ page, wallet })
    await context.close()
  },

  manager: async ({ browser, accounts }, use) => {
    const context = await browser.newContext()
    const page = await context.newPage()
    const wallet = await injectHeadlessWeb3Provider({
      page,
      privateKeys: accounts.getAllPrivateKeys(),
      chains: [localSepolia],
      permitted: [...PERMITTED_SIGN_KINDS],
    })
    await overrideManagerFeatureFlags(page, PROFILE_FEATURE_FLAGS)
    await connectManager(page, wallet)
    await dismissBackendAuthModal(page)
    await waitForManagerFeatureFlagOverride(page)
    await use({ page, wallet })
    await context.close()
  },

  makeV2Name: async ({ manager, accounts }, use) => {
    const time = createTime({ page: manager.page })
    const make = createMakeV2Name({
      time,
      userAccount: privateKeyToAccount(accounts.getPrivateKey('user')),
      otherAccount: privateKeyToAccount(accounts.getPrivateKey('user2')),
    })
    await use(async (config) => {
      const name = await make(config)
      await time.resume()
      // Both indexes: the manager reads bigname; the explorer reads its role
      // holders from Panoptes and refuses to transfer until they match the
      // registry, so a name it has not indexed yet blocks the transfer page.
      await waitForBignameName(name)
      const owner = accounts.getAddress(
        config.owner === 'other' ? 'user2' : 'user',
      ) as Address
      const resource = labelToCanonicalId(name.replace(/\.eth$/, ''))
      await waitForIndexedRoles(ETH_REGISTRY, resource, [owner])
      await waitForRoleHolder(ETH_REGISTRY, resource, owner)
      return name
    })
  },
})

export { expect } from '@playwright/test'

/**
 * Make `user` the account `session`'s app is connected as, and reload so the
 * app reads everything afresh for it.
 */
export async function asAccount(
  session: AppSession,
  accounts: PortalAccounts,
  user: User,
): Promise<void> {
  const first = accounts.getPrivateKey(user)
  await session.wallet.changeAccounts([
    first,
    ...accounts.getAllPrivateKeys().filter((key) => key !== first),
  ])
  await session.page.reload()
  await dismissBackendAuthModal(session.page, { timeout: 10_000 })
}
