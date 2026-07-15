import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Page } from '@playwright/test'
import { test as base } from '@playwright/test'
import type { Address, Hash } from 'viem'
import { bytesToHex } from 'viem'
import {
  mnemonicToAccount,
  nonceManager,
  privateKeyToAccount,
} from 'viem/accounts'
import { sepolia } from 'viem/chains'
import {
  injectHeadlessWeb3Provider,
  type Web3ProviderBackend,
} from '@ensdomains/headless-web3-provider'
import {
  connectWithHeadlessWallet,
  dismissBackendAuthModal,
  PERMITTED_SIGN_KINDS,
  signInBackendAuthModal,
} from '../helpers/manager-auth.js'
import { testClient } from '../helpers/anvil-client.js'
import { createIndexerMock, type MockDomain } from '../helpers/mock-indexer.js'
import type { PortalAccounts } from '../helpers/portal-auth.js'
import { createMakeName } from './makeName.js'
import { createMakeV2Name, type V2NameConfig } from './makeV2Name.js'
import { createTime, type Time } from './time.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Load the e2e `.env` natively (replaces `dotenv`). `process.loadEnvFile`
// throws if the file is missing, so guard on existence to keep the previous
// silent-when-absent behaviour.
const envPath = path.resolve(__dirname, '..', '.env')
if (existsSync(envPath)) {
  process.loadEnvFile(envPath)
}

// Override Sepolia chain to point at the local Anvil fork. The headless
// provider's internal walletClient uses this RPC to sign/submit.
const ANVIL_RPC_URL = process.env.ANVIL_RPC_URL ?? 'http://127.0.0.1:8545'
const localSepolia = {
  ...sepolia,
  rpcUrls: { default: { http: [ANVIL_RPC_URL] } },
} as const

const PROFILE_VIEW_FEATURE_FLAG = 'profile-view-new'

async function overrideManagerFeatureFlags(page: Page): Promise<void> {
  await page.addInitScript((profileViewFeatureFlag) => {
    type PostHogWindow = Window & {
      posthog?: {
        __loaded?: boolean
        featureFlags?: {
          overrideFeatureFlags(options: {
            flags: Record<string, boolean>
          }): void
        }
      }
    }

    const applyOverride = () => {
      const posthog = (window as PostHogWindow).posthog

      if (!posthog?.__loaded || !posthog.featureFlags) return false

      posthog.featureFlags.overrideFeatureFlags({
        flags: { [profileViewFeatureFlag]: true },
      })
      return true
    }

    if (applyOverride()) return

    const interval = window.setInterval(() => {
      if (applyOverride()) window.clearInterval(interval)
    }, 10)

    window.setTimeout(() => window.clearInterval(interval), 10_000)
  }, PROFILE_VIEW_FEATURE_FLAG)
}

// ---------------------------------------------------------------------------
// Accounts — derived from the default Anvil mnemonic
// ---------------------------------------------------------------------------
// The connected e2e user is mnemonic account 0 ('user'); the on-chain name
// fixtures register to the same account so the manager surfaces them as owned.
const DEFAULT_MNEMONIC =
  'test test test test test test test test test test test junk'
const ACCOUNT_USERS = ['user', 'user2', 'user3', 'user4'] as const

export function createAccounts(): PortalAccounts {
  const { accountList, privateKeys } = ACCOUNT_USERS.reduce<{
    accountList: { address: Address }[]
    privateKeys: Hash[]
  }>(
    (acc, _, index) => {
      const { getHdKey } = mnemonicToAccount(DEFAULT_MNEMONIC, {
        addressIndex: index,
      })
      const pk = bytesToHex(getHdKey().privateKey!) as Hash
      const account = privateKeyToAccount(pk, { nonceManager })
      return {
        accountList: [...acc.accountList, account],
        privateKeys: [...acc.privateKeys, pk],
      }
    },
    { accountList: [], privateKeys: [] },
  )

  return {
    getAddress: (user: string = 'user'): Address => {
      const index = ACCOUNT_USERS.indexOf(
        user as (typeof ACCOUNT_USERS)[number],
      )
      if (index < 0) throw new Error(`User not found: ${user}`)
      return accountList[index].address
    },
    getAllPrivateKeys: () => privateKeys,
    getPrivateKey: (user: string = 'user'): Hash => {
      const index = ACCOUNT_USERS.indexOf(
        user as (typeof ACCOUNT_USERS)[number],
      )
      if (index < 0) throw new Error(`User not found: ${user}`)
      return privateKeys[index]
    },
  }
}

// Shared indexer mock — active only when E2E_MOCK_INDEXER=true.
const indexerMock = createIndexerMock()

type ManagerFixtures = {
  /** Test accounts derived from the Anvil mnemonic. */
  accounts: PortalAccounts
  /** Headless web3 wallet backend — use to authorize transactions. */
  wallet: Web3ProviderBackend
  /**
   * Page with the headless wallet connected via RainbowKit and the
   * BackendAuthModal dismissed (skip-for-now). The default page for tests
   * that don't need backend-gated state.
   */
  connectedPage: Page
  /**
   * Same as `connectedPage` but completes the BackendAuthModal SIWE prompt
   * instead of dismissing it. Required for backend-gated features
   * (notification settings, favorites, etc). Hits the deployed worker.
   */
  authenticatedPageWithBackend: Page
  /** Time fixture for syncing anvil block time with the browser clock. */
  time: Time
  /** Register names on the anvil fork (supports expired / premium states). */
  makeName: ReturnType<typeof createMakeName>
  /**
   * Register a V2 .eth name on-chain to the connected user's EOA (Anvil
   * account 0), or to account 1 with `owner: 'other'`. When
   * E2E_MOCK_INDEXER=true the name is fed into the mock so dashboard/profile
   * queries return it.
   */
  makeV2Name: (config: V2NameConfig) => Promise<string>
  /**
   * Mock indexer control. When E2E_MOCK_INDEXER=true, call `addName()` after
   * on-chain registration so dashboard/profile queries return the name.
   */
  mockIndexer: {
    addName: (domain: MockDomain) => void
    enabled: boolean
  }
}

/**
 * Connect the headless wallet through RainbowKit. CI runs the HCA path
 * (VITE_FF_USE_EOA=false; see apps/manager/.env.ci): the smart-account machine
 * initialises, but the EnableSessions modal is now gated behind the "Pay with
 * stablecoins" action — it does NOT appear on connect. Only the BackendAuth
 * (SIWE) modal appears once connected, handled by the caller. In EOA mode the
 * gate is a no-op (the signer is an EOA), so no session modal appears at all.
 */
async function connectHeadless(
  page: Page,
  wallet: Web3ProviderBackend,
): Promise<void> {
  const baseURL = process.env.MANAGER_APP_URL ?? 'http://localhost:3000'
  await page.goto(baseURL)
  await Promise.race([
    page.waitForLoadState('networkidle'),
    page.waitForTimeout(5_000),
  ]).catch(() => {})

  await connectWithHeadlessWallet(page, wallet)
}

export const test = base.extend<ManagerFixtures>({
  // Install mock indexer on every page when E2E_MOCK_INDEXER=true.
  // This prevents connection-refused errors in CI where Panoptes isn't running.
  page: async ({ page }, use) => {
    await overrideManagerFeatureFlags(page)
    await indexerMock.installIfEnabled(page)
    await use(page)
  },

  accounts: async ({}, use) => {
    await use(createAccounts())
  },

  // Inject the headless web3 provider before any navigation so RainbowKit's
  // injected-wallet discovery surfaces it as "Headless Web3 Provider". Only
  // message-signing is auto-permitted; eth_sendTransaction is authorized
  // explicitly by the specs (see PERMITTED_SIGN_KINDS).
  wallet: async ({ page, accounts }, use) => {
    // The connected user is Anvil account 0 (0xf39F…2266), a well-known
    // account that carries leftover contract code on the Sepolia fork. The
    // UI registration mints an ERC-1155 name to it, and the safe-transfer
    // receiver check reverts against a non-receiver contract. Clear the code
    // so it behaves as a plain EOA (mirrors makeV2Name's owner handling).
    await testClient
      .setCode({ address: accounts.getAddress('user'), bytecode: '0x' })
      .catch(() => {})

    const wallet = await injectHeadlessWeb3Provider({
      page,
      privateKeys: accounts.getAllPrivateKeys(),
      chains: [localSepolia],
      permitted: [...PERMITTED_SIGN_KINDS],
    })
    await use(wallet)
  },

  connectedPage: async ({ page, wallet }, use) => {
    await connectHeadless(page, wallet)
    await dismissBackendAuthModal(page)
    await use(page)
  },

  authenticatedPageWithBackend: async ({ page, wallet }, use) => {
    await connectHeadless(page, wallet)
    await signInBackendAuthModal(page)
    await use(page)
  },

  time: async ({ page }, use) => {
    await use(createTime({ page }))
  },

  makeName: async ({ accounts, time }, use) => {
    await use(createMakeName({ accounts, time }))
  },

  makeV2Name: async ({ time, accounts }, use) => {
    const userAccount = privateKeyToAccount(accounts.getPrivateKey('user'))
    const otherAccount = privateKeyToAccount(accounts.getPrivateKey('user2'))
    const inner = createMakeV2Name({ time, userAccount, otherAccount })

    await use(async (config: V2NameConfig) => {
      const name = await inner(config)
      // Unfreeze the browser clock after registration so app timers
      // (receipt polling, dialog transitions) tick at real speed.
      await time.resume()
      if (indexerMock.enabled) {
        const ownerAddress =
          config.owner === 'other'
            ? accounts.getAddress('user2')
            : accounts.getAddress('user')
        indexerMock.addName({
          name,
          owner: ownerAddress,
          records: config.records,
        })
      }
      return name
    })
  },

  mockIndexer: async ({}, use) => {
    await use({
      addName: indexerMock.addName,
      enabled: indexerMock.enabled,
    })
  },
})

export { expect } from '@playwright/test'
export {
  authorizeApproveIfRequested,
  authorizeTransaction,
  authorizeTransactions,
} from '../helpers/manager-auth.js'
