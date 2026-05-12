import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Page } from '@playwright/test'
import { test as base } from '@playwright/test'
import { config as loadEnv } from 'dotenv'
import type { Address, Hash } from 'viem'
import { mnemonicToAccount, privateKeyToAccount } from 'viem/accounts'
import { bytesToHex } from 'viem'
import { authenticateWithPara } from '../helpers/para-auth.js'
import { createIndexerMock } from '../helpers/mock-indexer.js'
import { createMakeName } from './makeName.js'
import { createMakeV2Name, type V2NameConfig } from './makeV2Name.js'
import { createTime, type Time } from './time.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

loadEnv({ path: path.resolve(__dirname, '..', '.env') })

const PARA_EMAIL = process.env.PARA_E2E_EMAIL ?? 'test1@test.getpara.com'
const PARA_PIN = process.env.PARA_E2E_PIN ?? '123456'

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

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
/** Para test account EOA address (matches makeV2Name.ts). */
const PARA_EOA_ADDRESS = (() => {
  const key =
    (process.env.ANVIL_PARA_PRIVATE_KEY ??
      '0x4d1cf5e322e2a7dbfc9e3eccde100ed93167879de7449d18872911ed3a957a81') as `0x${string}`
  return privateKeyToAccount(key).address
})()

// Shared indexer mock — active only when E2E_MOCK_INDEXER=true.
const indexerMock = createIndexerMock()

type ManagerFixtures = {
  authenticatedPage: Page
  /** Time fixture for syncing anvil block time with the browser clock. */
  time: Time
  /** Register names on the anvil fork (supports expired / premium states). */
  makeName: ReturnType<typeof createMakeName>
  /**
   * Register a V2 .eth name on-chain to the authenticated user's smart account.
   * Much faster than `registerName` (contract calls vs UI flow).
   * Each name gets a dedicated resolver proxy so profile editing works.
   * When E2E_MOCK_INDEXER=true, registered names are automatically fed
   * into the mock so dashboard/profile queries return them.
   */
  makeV2Name: (config: V2NameConfig) => Promise<string>
  /**
   * Register a fresh .eth name via the UI registration flow. The authenticated
   * Para user becomes the owner. Returns the full name.
   */
  registerName: (labelPrefix: string) => Promise<string>
}

/**
 * Playwright-native fixture with an `authenticatedPage` that handles
 * Para wallet login using frameLocator() + native shadow DOM piercing,
 * plus `time` and `makeName` for chain-level test setup.
 */
export const test = base.extend<ManagerFixtures>({
  authenticatedPage: async ({ page }, use) => {
    // When E2E_MOCK_INDEXER=true, intercept indexer GraphQL before any navigation.
    await indexerMock.installIfEnabled(page)

    const baseURL = process.env.MANAGER_APP_URL ?? 'http://localhost:3000'
    await page.goto(baseURL)
    // Brief wait for app initialisation; cap at 5 s so HMR websocket doesn't block
    await Promise.race([
      page.waitForLoadState('networkidle'),
      page.waitForTimeout(5_000),
    ]).catch(() => {})

    await authenticateWithPara(page, {
      email: PARA_EMAIL,
      pin: PARA_PIN,
    })

    // The smart account initialises asynchronously after Para auth.
    // When Rhinestone sessions are enabled, an "Enable Smart Sessions"
    // modal appears that CANNOT be dismissed — the user must click
    // "Enable Sessions".  We wait for it to appear, click through it,
    // and then wait for the overlay to fully close.
    const enableBtn = page.getByRole('button', { name: /enable sessions/i })
    try {
      await enableBtn.waitFor({ state: 'visible', timeout: 30_000 })
      await enableBtn.click()
      // Modal shows a 1.5 s success state before closing; wait for the
      // dialog overlay to disappear so subsequent navigations are clean.
      const overlay = page.locator('[data-slot="alert-dialog-overlay"]')
      await overlay
        .waitFor({ state: 'hidden', timeout: 30_000 })
        .catch(() => {})
    } catch {
      // Modal never appeared — sessions already enabled or feature flag off
    }

    await use(page)
  },

  time: async ({ page }, use) => {
    await use(createTime({ page }))
  },

  makeName: async ({ time }, use) => {
    const accounts = createAnvilAccounts()
    await use(createMakeName({ accounts, time }))
  },

  makeV2Name: async ({}, use) => {
    const inner = createMakeV2Name()
    await use(async (config: V2NameConfig) => {
      const name = await inner(config)
      // Feed the registered name into the indexer mock so subsequent
      // page navigations (dashboard, profile) return it in queries.
      if (indexerMock.enabled) {
        const ownerAddress =
          config.owner === 'other'
            ? '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266' // Anvil funder
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
