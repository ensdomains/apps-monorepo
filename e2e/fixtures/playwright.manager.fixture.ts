import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Page } from '@playwright/test'
import { test as base } from '@playwright/test'
import { config as loadEnv } from 'dotenv'
import type { Address, Hash } from 'viem'
import { mnemonicToAccount, privateKeyToAccount } from 'viem/accounts'
import { bytesToHex } from 'viem'
import { authenticateWithPara } from '../helpers/para-auth.js'
import {
  anvilSnapshotFixture,
  type AnvilSnapshotFixture,
} from './anvilSnapshot.js'
import { createMakeName } from './makeName.js'
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
type ManagerFixtures = {
  authenticatedPage: Page
  /** Time fixture for syncing anvil block time with the browser clock. */
  time: Time
  /** Register names on the anvil fork (supports expired / premium states). */
  makeName: ReturnType<typeof createMakeName>
}

/**
 * Playwright-native fixture with an `authenticatedPage` that handles
 * Para wallet login using frameLocator() + native shadow DOM piercing,
 * plus `time` and `makeName` for chain-level test setup.
 */
export const test = base.extend<ManagerFixtures & AnvilSnapshotFixture>({
  ...anvilSnapshotFixture,
  authenticatedPage: async ({ page }, use) => {
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

    await use(page)
  },

  time: async ({ page }, use) => {
    await use(createTime({ page }))
  },

  makeName: async ({ time }, use) => {
    const accounts = createAnvilAccounts()
    await use(createMakeName({ accounts, time }))
  },
})

export { expect } from '@playwright/test'
