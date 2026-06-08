import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Page } from '@playwright/test'
import { test as base } from '@playwright/test'
import { config as loadEnv } from 'dotenv'
import type { Address, Hash } from 'viem'
import { bytesToHex } from 'viem'
import { mnemonicToAccount, privateKeyToAccount } from 'viem/accounts'
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
import { createIndexerMock, type MockDomain } from '../helpers/mock-indexer.js'
import { createMakeName } from './makeName.js'
import { createMakeV2Name, type V2NameConfig } from './makeV2Name.js'
import { createTime, type Time } from './time.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

loadEnv({ path: path.resolve(__dirname, '..', '.env') })

// Override Sepolia chain to point at the local Anvil fork. The headless
// provider's internal walletClient uses this RPC to sign/submit.
const ANVIL_RPC_URL = process.env.ANVIL_RPC_URL ?? 'http://127.0.0.1:8545'
const localSepolia = {
  ...sepolia,
  rpcUrls: {
    default: { http: [ANVIL_RPC_URL] },
  },
} as const

// ---------------------------------------------------------------------------
// Connected wallet account
// ---------------------------------------------------------------------------
// The e2e user connects an external EOA through RainbowKit (headless web3
// provider). This is the same key the on-chain fixtures (`makeV2Name`,
// `makeV1Name`) register names to, so the manager app — which resolves the
// HCA smart account back to its EOA owner — surfaces those names as owned.
// (Env var keeps its historical `ANVIL_PARA_…` name; the value is just the
// e2e wallet's private key.)
const E2E_WALLET_KEY = (process.env.ANVIL_PARA_PRIVATE_KEY ??
  '0x4d1cf5e322e2a7dbfc9e3eccde100ed93167879de7449d18872911ed3a957a81') as Hash
const E2E_WALLET_ADDRESS = privateKeyToAccount(E2E_WALLET_KEY).address

// ---------------------------------------------------------------------------
// Anvil accounts (for makeName fixture — registers names directly on-chain)
// ---------------------------------------------------------------------------
const DEFAULT_MNEMONIC =
  'test test test test test test test test test test test junk'

function createAnvilAccounts() {
  const users = ['user', 'user2', 'user3', 'user4'] as const
  const { addresses, privateKeys } = users.reduce<{
    addresses: Address[]
    privateKeys: Hash[]
  }>(
    (acc, _, index) => {
      const { getHdKey } = mnemonicToAccount(DEFAULT_MNEMONIC, {
        addressIndex: index,
      })
      const pk = bytesToHex(getHdKey().privateKey!) as Hash
      const account = privateKeyToAccount(pk)
      return {
        addresses: [...acc.addresses, account.address],
        privateKeys: [...acc.privateKeys, pk],
      }
    },
    { addresses: [], privateKeys: [] },
  )

  return {
    getAddress: (user: string = 'user'): Address => {
      const index = users.indexOf(user as (typeof users)[number])
      if (index < 0) throw new Error(`User not found: ${user}`)
      return addresses[index]
    },
    getPrivateKey: (user: string = 'user'): Hash => {
      const index = users.indexOf(user as (typeof users)[number])
      if (index < 0) throw new Error(`User not found: ${user}`)
      return privateKeys[index]
    },
  }
}

// Shared indexer mock — active only when E2E_MOCK_INDEXER=true.
const indexerMock = createIndexerMock()

type ManagerFixtures = {
  /** Headless web3 wallet backend — injected but NOT connected. */
  wallet: Web3ProviderBackend
  /**
   * Page authenticated via the RainbowKit headless wallet, with the
   * EnableSessions modal clicked through and the BackendAuthModal
   * **dismissed** (skip-for-now). Suitable for tests that only need wallet
   * connection + SCA setup. Notification/favorites/anything gated by
   * `RequireBackendAuth` should use `authenticatedPageWithBackend` instead.
   */
  authenticatedPage: Page
  /**
   * Same as `authenticatedPage` but completes the BackendAuthModal SIWE
   * prompt (signs in with the connected wallet) instead of dismissing it.
   * Required for tests that touch backend-gated features.
   *
   * Note: this hits the deployed Cloudflare worker (no local SIWE stack),
   * so flakes from the worker propagate here.
   */
  authenticatedPageWithBackend: Page
  /** Time fixture for syncing anvil block time with the browser clock. */
  time: Time
  /** Register names on the anvil fork (supports expired / premium states). */
  makeName: ReturnType<typeof createMakeName>
  /**
   * Register a V2 .eth name on-chain to the connected user's EOA.
   * Much faster than `registerName` (contract calls vs UI flow).
   * Each name gets a dedicated resolver proxy so profile editing works.
   * When E2E_MOCK_INDEXER=true, registered names are automatically fed
   * into the mock so dashboard/profile queries return them.
   */
  makeV2Name: (config: V2NameConfig) => Promise<string>
  /**
   * Register a fresh .eth name via the UI registration flow. The connected
   * user becomes the owner. Returns the full name.
   */
  registerName: (labelPrefix: string) => Promise<string>
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
 * Shared connect + EnableSessions setup. Connects the headless wallet
 * through the RainbowKit modal, then clicks through the EnableSessions
 * modal if it appears. Stops short of the BackendAuthModal so individual
 * fixtures can choose whether to dismiss it (default) or complete SIWE.
 */
async function setupAuthenticatedPage(
  page: Page,
  wallet: Web3ProviderBackend,
): Promise<void> {
  const baseURL = process.env.MANAGER_APP_URL ?? 'http://localhost:3000'
  await page.goto(baseURL)
  // Brief wait for app initialisation; cap at 5 s so HMR websocket doesn't block
  await Promise.race([
    page.waitForLoadState('networkidle'),
    page.waitForTimeout(5_000),
  ]).catch(() => {})

  await connectWithHeadlessWallet(page, wallet)

  // The smart account initialises asynchronously after connecting.
  // When Rhinestone sessions are enabled, an "Enable Smart Sessions"
  // modal appears that CANNOT be dismissed — the user must click
  // "Enable Sessions". We wait for it to appear, click through it,
  // and then wait for the overlay to fully close.
  //
  // Note: EnableSessionModal uses Radix `Dialog`, so its overlay is
  // `dialog-overlay`. The matching wait below targets that exact
  // slot — `alert-dialog-overlay` would belong to the BackendAuth
  // dialog instead and would never appear at this stage of the flow.
  const enableBtn = page.getByRole('button', { name: /enable sessions/i })
  try {
    await enableBtn.waitFor({ state: 'visible', timeout: 30_000 })
    await enableBtn.click()
    const overlay = page.locator('[data-slot="dialog-overlay"]')
    await overlay.waitFor({ state: 'hidden', timeout: 30_000 }).catch(() => {})
  } catch {
    // Modal never appeared — sessions already enabled or feature flag off
  }
}

/**
 * Playwright-native fixture with an `authenticatedPage` that connects the
 * headless web3 wallet through RainbowKit, plus `time` and `makeName` for
 * chain-level test setup.
 */
export const test = base.extend<ManagerFixtures>({
  // Install mock indexer on every page when E2E_MOCK_INDEXER=true.
  // This prevents connection-refused errors in CI where Panoptes isn't running.
  page: async ({ page }, use) => {
    await indexerMock.installIfEnabled(page)
    await use(page)
  },

  // Inject the headless web3 provider before any navigation so RainbowKit's
  // injected-wallet discovery surfaces it as "Headless Web3 Provider".
  wallet: async ({ page }, use) => {
    const wallet = await injectHeadlessWeb3Provider({
      page,
      privateKeys: [E2E_WALLET_KEY],
      chains: [localSepolia],
      permitted: [...PERMITTED_SIGN_KINDS],
    })
    await use(wallet)
  },

  authenticatedPage: async ({ page, wallet }, use) => {
    await setupAuthenticatedPage(page, wallet)

    // After the smart account becomes ready, the app shows a
    // BackendAuthModal ("Verify your wallet" / SIWE) that blocks pointer
    // events on the rest of the page. We skip rather than complete the SIWE
    // flow because the backend API worker is not part of the e2e infra stack
    // — see `dismissBackendAuthModal`. Tests that need backend auth should
    // use `authenticatedPageWithBackend` instead.
    await dismissBackendAuthModal(page)

    await use(page)
  },

  authenticatedPageWithBackend: async ({ page, wallet }, use) => {
    await setupAuthenticatedPage(page, wallet)

    // Complete the SIWE flow against the deployed backend worker. Adds
    // external-flake exposure to the deployed Cloudflare worker — only use
    // this for tests that genuinely need backend-gated state.
    await signInBackendAuthModal(page)

    await use(page)
  },

  time: async ({ page }, use) => {
    await use(createTime({ page }))
  },

  makeName: async ({ time }, use) => {
    const accounts = createAnvilAccounts()
    await use(createMakeName({ accounts, time }))
  },

  makeV2Name: async ({ time }, use) => {
    const inner = createMakeV2Name({ time })
    await use(async (config: V2NameConfig) => {
      const name = await inner(config)
      // Feed the registered name into the indexer mock so subsequent
      // page navigations (dashboard, profile) return it in queries.
      if (indexerMock.enabled) {
        const ownerAddress =
          config.owner === 'other'
            ? '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266' // Anvil funder
            : E2E_WALLET_ADDRESS
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

  registerName: async ({ authenticatedPage }, use) => {
    const baseURL = process.env.MANAGER_APP_URL ?? 'http://localhost:3000'
    await use(async (labelPrefix: string): Promise<string> => {
      const uniqueLabel = `${labelPrefix}-${Date.now().toString(36)}`
      const fullName = `${uniqueLabel}.eth`
      await authenticatedPage.goto(
        `${baseURL}/register/${encodeURIComponent(fullName)}`,
      )

      await authenticatedPage
        .getByRole('button', { name: /pay with stablecoins/i })
        .click()
      await authenticatedPage
        .getByRole('button', { name: /select usdc/i })
        .click()
      await authenticatedPage
        .getByRole('button', { name: /buy name/i })
        .click()
      const successBanner = authenticatedPage.getByText('Registration Complete!')
      await successBanner.waitFor({ state: 'visible', timeout: 90_000 })

      // Navigate back to the dashboard so the test starts from a clean state
      await authenticatedPage.goto(baseURL)
      await authenticatedPage.waitForLoadState('networkidle')

      return fullName
    })
  },
})

export { expect } from '@playwright/test'
