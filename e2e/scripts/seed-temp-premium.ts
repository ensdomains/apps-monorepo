/**
 * Seed a temporary-premium name on the local Anvil fork for MANUAL demos.
 *
 * Reuses the SAME `createMakeName` flow as the e2e temp-premium tests, but runs
 * standalone (no Playwright). It registers a name to `user2` (so your connected
 * wallet is NOT the previous owner — the StandardRentPriceOracle exempts the
 * previous owner from the premium), then warps anvil time so the name is
 * expired by `DAYS` days, landing it in the 21-day premium window.
 *
 * The premium decays exponentially (~$100M, halving each day), so the starting
 * additional fee is roughly `$100M / 2^DAYS`:
 *   DAYS=1   → ~$50M     DAYS=4  → ~$6.25M
 *   DAYS=13.3→ ~$10K     DAYS=18 → ~$380
 *
 * Prereqs:
 *   - Local stack up:   pnpm --filter @ens-apps/e2e infra:up
 *   - ANVIL_RPC_URL points at it (default http://127.0.0.1:8545)
 *
 * Usage:
 *   pnpm --filter @ens-apps/e2e seed:premium
 *   LABEL=tem DAYS=13.3 pnpm --filter @ens-apps/e2e seed:premium
 *
 * It prints the FULL name (a unique timestamp suffix is appended). Open the app
 * at /register/<name> while SIGNED IN (premium only shows for a non-zero owner)
 * and buy it — you're funded with mock USDC by the infra scripts.
 */
import { bytesToHex, type Address, type Hash } from 'viem'
import { mnemonicToAccount, privateKeyToAccount } from 'viem/accounts'
import { createMakeName } from '../fixtures/makeName.js'
import type { Time } from '../fixtures/time.js'
import { publicClient } from '../helpers/anvil-client.js'

const LABEL = process.env.LABEL ?? 'tem'
const DAYS = Number.parseFloat(process.env.DAYS ?? '13.3')
const SECONDS_PER_DAY = 24 * 60 * 60

/**
 * Anvil accounts from the standard test mnemonic — mirrors the manager
 * fixture's `createAnvilAccounts`. `createMakeName` registers to `user2`.
 */
const DEFAULT_MNEMONIC =
  'test test test test test test test test test test test junk'

function createAnvilAccounts() {
  const users = ['user', 'user2', 'user3', 'user4'] as const
  const addresses: Address[] = []
  const privateKeys: Hash[] = []
  users.forEach((_, index) => {
    const { getHdKey } = mnemonicToAccount(DEFAULT_MNEMONIC, {
      addressIndex: index,
    })
    // biome-ignore lint/style/noNonNullAssertion: hd key always has a private key
    const pk = bytesToHex(getHdKey().privateKey!) as Hash
    addresses.push(privateKeyToAccount(pk).address)
    privateKeys.push(pk)
  })
  return {
    getAddress: (user = 'user'): Address => {
      const i = users.indexOf(user as (typeof users)[number])
      if (i < 0) throw new Error(`User not found: ${user}`)
      return addresses[i]
    },
    getPrivateKey: (user = 'user'): Hash => {
      const i = users.indexOf(user as (typeof users)[number])
      if (i < 0) throw new Error(`User not found: ${user}`)
      return privateKeys[i]
    },
  }
}

/**
 * No-op `Time` stub. `createMakeName` only uses `time.sync()` to align the
 * Playwright browser clock — irrelevant for a headless seed. (The app reads the
 * authoritative premium straight from the chain when you open it.)
 */
const noopTime: Time = {
  sync: async () => {},
  increaseTime: async () => {},
  syncFixed: async () => {},
  logBlockTime: async () => {},
}

async function main() {
  if (!Number.isFinite(DAYS) || DAYS <= 0) {
    throw new Error(`DAYS must be a positive number, got "${process.env.DAYS}"`)
  }

  const estPremium = 100_000_000 / 2 ** DAYS
  console.log(
    `Seeding "${LABEL}" expired ${DAYS} days ago → est. additional fee ≈ $${Math.round(
      estPremium,
    ).toLocaleString()}`,
  )

  const makeName = createMakeName({
    accounts: createAnvilAccounts(),
    time: noopTime,
  })

  const name = await makeName(
    { label: LABEL, duration: -(DAYS * SECONDS_PER_DAY) },
    { timeOffset: 0 },
  )

  const block = await publicClient.getBlock()

  console.log('\n──────────────────────────────────────────────')
  console.log(`  Ready to buy:   ${name}`)
  console.log(`  Open the app:   /register/${name}`)
  console.log(
    `  Additional fee ≈ $${Math.round(estPremium).toLocaleString()} (decays from here)`,
  )
  console.log(
    `  Anvil block time: ${new Date(Number(block.timestamp) * 1000).toISOString()}`,
  )
  console.log('  Sign in first — premium is hidden for a zero-address owner.')
  console.log('──────────────────────────────────────────────\n')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
