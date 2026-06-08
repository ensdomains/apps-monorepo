import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Page } from '@playwright/test'
import { test as base } from '@playwright/test'
import { config as loadEnv } from 'dotenv'
import type { Address, Hash } from 'viem'
import { bytesToHex } from 'viem'
import { mnemonicToAccount, nonceManager, privateKeyToAccount } from 'viem/accounts'
import { sepolia } from 'viem/chains'
import {
  injectHeadlessWeb3Provider,
  type Web3ProviderBackend,
} from '@ensdomains/headless-web3-provider'
import {
  authenticateWithPara,
  dismissBackendAuthModal,
  signInBackendAuthModal,
} from '../helpers/para-auth.js'
import { connectWithHeadlessWalletManager } from '../helpers/manager-auth.js'
import type { PortalAccounts } from '../helpers/portal-auth.js'
import { createIndexerMock, type MockDomain } from '../helpers/mock-indexer.js'
import { createMakeName } from './makeName.js'
import { createMakeV2Name, type V2NameConfig } from './makeV2Name.js'
import { createTime, type Time } from './time.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

loadEnv({ path: path.resolve(__dirname, '..', '.env') })

const PARA_EMAIL = process.env.PARA_E2E_EMAIL ?? 'test1@test.getpara.com'
const PARA_PIN = process.env.PARA_E2E_PIN ?? '123456'
const ANVIL_RPC_URL = process.env.ANVIL_RPC_URL ?? 'http://127.0.0.1:8545'

const localSepolia = {
  ...sepolia,
  rpcUrls: { default: { http: [ANVIL_RPC_URL] } },
} as const

// ---------------------------------------------------------------------------
// Accounts — derived from the default Anvil mnemonic
// ---------------------------------------------------------------------------
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
      const index = ACCOUNT_USERS.indexOf(user as (typeof ACCOUNT_USERS)[number])
      if (index < 0) throw new Error(`User not found: ${user}`)
      return accountList[index].address
    },
    getAllPrivateKeys: () => privateKeys,
    getPrivateKey: (user: string = 'user'): Hash => {
      const index = ACCOUNT_USERS.indexOf(user as (typeof ACCOUNT_USERS)[number])
      if (index < 0) throw new Error(`User not found: ${user}`)
      return privateKeys[index]
    },
  }
}

// ---------------------------------------------------------------------------
// Para EOA address (used by the Para-flavoured makeV2Name variant)
// ---------------------------------------------------------------------------
const PARA_EOA_ADDRESS = (() => {
  const key =
    (process.env.ANVIL_PARA_PRIVATE_KEY ??
      '0x4d1cf5e322e2a7dbfc9e3eccde100ed93167879de7449d18872911ed3a957a81') as `0x${string}`
  return privateKeyToAccount(key).address
})()

// Shared indexer mock — active only when E2E_MOCK_INDEXER=true.
const indexerMock = createIndexerMock()

// ---------------------------------------------------------------------------
// Fixture types
// ---------------------------------------------------------------------------
type ManagerFixtures = {
  // ── Headless wallet (default) ─────────────────────────────────────────────
  /** Test accounts derived from the Anvil mnemonic. */
  accounts: PortalAccounts
  /** Headless web3 wallet backend — use to authorize transactions. */
  wallet: Web3ProviderBackend
  /**
   * Page with the headless wallet injected and connected to the manager app.
   * This is the default authenticated page for new tests.
   */
  connectedPage: Page

  // ── Para wallet (legacy, kept until headless tests are complete) ──────────
  /**
   * Page authenticated via Para email+OTP, with the EnableSessions
   * modal clicked through and the BackendAuthModal **dismissed**
   * (skip-for-now). Suitable for tests that only need Para auth + SCA
   * setup.
   */
  authenticatedPage: Page
  /**
   * Same as `authenticatedPage` but completes the BackendAuthModal
   * SIWE prompt instead of dismissing it. Required for backend-gated
   * features: notification settings, favorites, etc.
   */
  authenticatedPageWithBackend: Page

  // ── Shared fixtures ───────────────────────────────────────────────────────
  /** Time fixture for syncing anvil block time with the browser clock. */
  time: Time
  /** Register names on the anvil fork (supports expired / premium states). */
  makeName: ReturnType<typeof createMakeName>
  /**
   * Register a V2 .eth name on-chain to the connected **headless** user
   * (Anvil account 0). This is the default variant.
   * When E2E_MOCK_INDEXER=true, registered names are fed into the mock.
   */
  makeV2Name: (config: V2NameConfig) => Promise<string>
  /**
   * Register a V2 .eth name on-chain to the **Para EOA**.
   * Legacy variant kept for Para-authenticated tests.
   */
  makeV2NamePara: (config: V2NameConfig) => Promise<string>
  /**
   * Register a fresh .eth name via the UI registration flow.
   * The authenticated Para user becomes the owner.
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

// ---------------------------------------------------------------------------
// Para auth helpers
// ---------------------------------------------------------------------------
async function setupAuthenticatedPage(page: Page): Promise<void> {
  const baseURL = process.env.MANAGER_APP_URL ?? 'http://localhost:3000'
  await page.goto(baseURL)
  await Promise.race([
    page.waitForLoadState('networkidle'),
    page.waitForTimeout(5_000),
  ]).catch(() => {})

  await authenticateWithPara(page, { email: PARA_EMAIL, pin: PARA_PIN })

  const enableBtn = page.getByRole('button', { name: /enable sessions/i })
  try {
    await enableBtn.waitFor({ state: 'visible', timeout: 30_000 })
    await enableBtn.click()
    const overlay = page.locator('[data-slot="dialog-overlay"]')
    await overlay
      .waitFor({ state: 'hidden', timeout: 30_000 })
      .catch(() => {})
  } catch {
    // Modal never appeared — sessions already enabled or feature flag off
  }
}

// ---------------------------------------------------------------------------
// Fixture definitions
// ---------------------------------------------------------------------------
export const test = base.extend<ManagerFixtures>({
  // Install mock indexer on every page when E2E_MOCK_INDEXER=true.
  page: async ({ page }, use) => {
    await indexerMock.installIfEnabled(page)
    await use(page)
  },

  // ── Headless wallet fixtures ──────────────────────────────────────────────

  accounts: async ({}, use) => {
    await use(createAccounts())
  },

  wallet: async ({ page, accounts }, use) => {
    const privateKeys = accounts.getAllPrivateKeys()
    const wallet = await injectHeadlessWeb3Provider({
      page,
      privateKeys,
      chains: [localSepolia],
    })
    await use(wallet)
  },

  connectedPage: async ({ page, wallet, accounts: _accounts }, use) => {
    // Para's external wallet config uses `wallets: ['METAMASK']` with
    // `connectionOnly: true`. It detects MetaMask by checking
    // `window.ethereum.isMetaMask`. Patching that flag after the headless
    // provider's init script runs makes Para treat the headless wallet as
    // a MetaMask-compatible provider and show it in the connect modal.
    await page.addInitScript(() => {
      const patch = () => {
        if ((globalThis as any).ethereum) {
          ;(globalThis as any).ethereum.isMetaMask = true
        }
      }
      if (document.readyState === 'loading') {
        globalThis.addEventListener('DOMContentLoaded', patch)
      } else {
        patch()
      }
    })

    const baseURL = process.env.MANAGER_APP_URL ?? 'http://localhost:3000'
    await page.goto(baseURL)
    await Promise.race([
      page.waitForLoadState('networkidle'),
      page.waitForTimeout(5_000),
    ]).catch(() => {})

    await connectWithHeadlessWalletManager(page, wallet)

    // Dismiss the BackendAuthModal ("Verify your wallet") that appears after
    // connection. Same as authenticatedPage — tests that need backend features
    // should use a variant that completes SIWE instead.
    await dismissBackendAuthModal(page)

    await use(page)
  },

  // ── Para wallet fixtures (legacy) ─────────────────────────────────────────

  authenticatedPage: async ({ page }, use) => {
    await setupAuthenticatedPage(page)
    await dismissBackendAuthModal(page)
    await use(page)
  },

  authenticatedPageWithBackend: async ({ page }, use) => {
    await setupAuthenticatedPage(page)
    await signInBackendAuthModal(page)
    await use(page)
  },

  // ── Shared fixtures ───────────────────────────────────────────────────────

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

  makeV2NamePara: async ({ time }, use) => {
    const inner = createMakeV2Name({ time })
    await use(async (config: V2NameConfig) => {
      const name = await inner(config)
      if (indexerMock.enabled) {
        const ownerAddress =
          config.owner === 'other'
            ? '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'
            : PARA_EOA_ADDRESS
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

      await authenticatedPage.goto(baseURL)
      await authenticatedPage.waitForLoadState('networkidle')

      return fullName
    })
  },
})

export { expect } from '@playwright/test'
export { authorizeTransaction, authorizeTransactions } from '../helpers/manager-auth.js'
