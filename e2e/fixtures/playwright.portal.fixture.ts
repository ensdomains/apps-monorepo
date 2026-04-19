import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Page } from '@playwright/test'
import { test as base } from '@playwright/test'
import { config as loadEnv } from 'dotenv'
import { type Account, type Address, bytesToHex, type Hash } from 'viem'
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
  type PortalAccounts,
} from '../helpers/portal-auth.js'
import {
  anvilSnapshotFixture,
  type AnvilSnapshotFixture,
} from './anvilSnapshot.js'
import { createMakeName } from './makeName.js'
import { createTime, type Time } from './time.js'

// Override Sepolia chain to point at the local Anvil fork.
// The headless provider's internal walletClient uses this RPC URL
// to estimate gas and submit transactions.
const ANVIL_RPC_URL = process.env.ANVIL_RPC_URL ?? 'http://127.0.0.1:8545'
const localSepolia = {
  ...sepolia,
  rpcUrls: {
    default: { http: [ANVIL_RPC_URL] },
  },
} as const

const __dirname = path.dirname(fileURLToPath(import.meta.url))

loadEnv({ path: path.resolve(__dirname, '..', '.env') })

// ---------------------------------------------------------------------------
// Accounts — derived from the default Anvil mnemonic
// Account 0 (0xf39F…2266) has 10 000 ETH on any Anvil fork.
// ---------------------------------------------------------------------------
const DEFAULT_MNEMONIC =
  'test test test test test test test test test test test junk'

const users = ['user', 'user2', 'user3', 'user4'] as const
export type User = (typeof users)[number]

export function createAccounts(): PortalAccounts {
  const mnemonic = DEFAULT_MNEMONIC

  const { accounts, privateKeys } = users.reduce<{
    accounts: Account[]
    privateKeys: Hash[]
  }>(
    (acc, _, index) => {
      const { getHdKey } = mnemonicToAccount(mnemonic, {
        addressIndex: index,
      })
      const privateKey = bytesToHex(getHdKey().privateKey!)
      const account = privateKeyToAccount(privateKey, { nonceManager })
      return {
        accounts: [...acc.accounts, account],
        privateKeys: [...acc.privateKeys, privateKey],
      }
    },
    { accounts: [], privateKeys: [] },
  )

  return {
    getAddress: (user: User = 'user'): Address => {
      const index = users.indexOf(user)
      if (index < 0) throw new Error(`User not found: ${user}`)
      return accounts[index].address
    },
    getAllPrivateKeys: () => privateKeys,
    getPrivateKey: (user: User = 'user') => {
      const index = users.indexOf(user)
      if (index < 0) throw new Error(`User not found: ${user}`)
      return privateKeys[index]
    },
  }
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
type PortalFixtures = {
  /** Headless web3 wallet backend — use to authorize transactions. */
  wallet: Web3ProviderBackend
  /** Test accounts derived from the Anvil mnemonic. */
  accounts: PortalAccounts
  /** Page with the headless wallet already injected (but NOT connected). */
  portalPage: Page
  /** Time fixture for syncing anvil block time with the browser clock. */
  time: Time
  /** Register names on the anvil fork (supports expired / premium states). */
  makeName: ReturnType<typeof createMakeName>
}

export const test = base.extend<PortalFixtures & AnvilSnapshotFixture>({
  ...anvilSnapshotFixture,
  accounts: async ({ }, use) => {
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

  portalPage: async ({ page, wallet }, use) => {
    const baseURL =
      process.env.PORTAL_APP_URL ?? 'http://localhost:3001'
    await page.goto(baseURL)
    // Brief wait for app initialisation
    await Promise.race([
      page.waitForLoadState('networkidle'),
      page.waitForTimeout(5_000),
    ]).catch(() => { })
    await use(page)
  },

  time: async ({ page }, use) => {
    await use(createTime({ page }))
  },

  makeName: async ({ accounts, time }, use) => {
    await use(createMakeName({ accounts, time }))
  },
})

export { expect } from '@playwright/test'
export { connectWithHeadlessWallet } from '../helpers/portal-auth.js'
