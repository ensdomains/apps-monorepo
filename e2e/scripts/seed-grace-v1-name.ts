/**
 * Seeds V1 names for MANUAL QA of WEB-424 / PR #1274 (grace-period names in
 * the migration flow), all owned by Anvil account #0.
 *
 *   pnpm --filter @ens-apps/e2e seed:grace-v1                # the full case set
 *   SET=unwrapped pnpm --filter @ens-apps/e2e seed:grace-v1  # one grace name
 *   pnpm --filter @ens-apps/e2e seed:grace-v1 usdc:drain     # park all USDC on account #1
 *   pnpm --filter @ens-apps/e2e seed:grace-v1 usdc:restore   # bring it back
 *
 * The full set is one active name plus three in grace — unwrapped, wrapped
 * (no fuses) and locked (CANNOT_UNWRAP) — so each case is a different
 * selection on /migration.
 *
 * Why not the migration tool's "Grace RW" presets: they register for a year
 * and then advance the SHARED fork clock by ~410 days per click, which breaks
 * HCA signing for every other session on the fork. This uses
 * `makeGraceV1Name` instead — a 90s registration, ~90s of clock movement.
 *
 * The browser can't see fork-only names on the public V1 subgraph, so this
 * prints a `document.cookie = …` line for the dev migration tool's injection
 * list (`ens_migration_tool_v1_names`). Paste it into the manager's devtools
 * console and reload. Requires the manager running with
 * `VITE_MIGRATION_TOOL=1 VITE_TIME_TRAVEL=1` and the default V1 subgraph URL,
 * and — because the app decides "in grace" from `Date.now()` — press **Sync**
 * in the Time Travel panel afterwards.
 */

import { ensL1Contracts, supportedL1Chains } from '@ensdomains/ensjs/chain'
import { erc20Abi, labelhash, parseAbi } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { makeGraceV1Name } from '../fixtures/makeGraceV1Name.js'
import { createMakeV1Name, V1_BASE_REGISTRAR } from '../fixtures/makeV1Name.js'
import { createAccounts } from '../fixtures/playwright.portal.fixture.js'
import { publicClient, walletClient } from '../helpers/anvil-client.js'

const MANAGER_APP_URL = process.env.MANAGER_APP_URL ?? 'http://localhost:3000'
const COOKIE = 'ens_migration_tool_v1_names'
const PANEL_WRAPPED_RESOLVER = '0xE99638b40E4Fff0129D56f03b55b6bbC4BBE49b5'
const USDC = ensL1Contracts[supportedL1Chains.sepolia].usdc.address

type InjectedName = {
  label: string
  type: 'grace-renewable-unwrapped' | 'wrapped' | 'locked' | 'unwrapped'
  id: string
  expiryDate: number
}

const accounts = createAccounts()
const owner = privateKeyToAccount(accounts.getPrivateKey('user'))
const holder = privateKeyToAccount(accounts.getPrivateKey('user2'))

const usdcOf = (address: `0x${string}`) =>
  publicClient.readContract({
    address: USDC,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [address],
  })

async function moveAllUsdc(
  from: typeof owner,
  to: typeof owner,
): Promise<void> {
  const amount = await usdcOf(from.address)
  if (amount > 0n) {
    const hash = await walletClient.writeContract({
      account: from,
      address: USDC,
      abi: erc20Abi,
      functionName: 'transfer',
      args: [to.address, amount],
    })
    await publicClient.waitForTransactionReceipt({ hash })
  }
  console.log(
    `USDC  you: ${Number(await usdcOf(owner.address)) / 1e6}   account #1: ${Number(await usdcOf(holder.address)) / 1e6}`,
  )
}

async function seedGrace(
  label: string,
  kind: 'unwrapped' | 'wrapped' | 'locked',
): Promise<InjectedName> {
  const grace = await makeGraceV1Name({
    label,
    owner,
    wrapped: kind === 'wrapped',
    locked: kind === 'locked',
    // The dev migration tool reports this resolver for every wrapped name it
    // injects, so the chain must agree or migration preflight rejects it.
    resolver: kind === 'unwrapped' ? undefined : PANEL_WRAPPED_RESOLVER,
  })
  return {
    label: grace.label,
    type: kind === 'unwrapped' ? 'grace-renewable-unwrapped' : kind,
    id: `${grace.label}-${Date.now()}`,
    expiryDate: Number(grace.expiry),
  }
}

async function seedActive(): Promise<InjectedName> {
  const name = await createMakeV1Name({ userAccount: owner })({
    label: 'qa-active',
  })
  const label = name.replace(/\.eth$/, '')
  const expiry = await publicClient.readContract({
    address: V1_BASE_REGISTRAR,
    abi: parseAbi(['function nameExpires(uint256 id) view returns (uint256)']),
    functionName: 'nameExpires',
    args: [BigInt(labelhash(label))],
  })
  return {
    label,
    type: 'unwrapped',
    id: `${label}-${Date.now()}`,
    expiryDate: Number(expiry),
  }
}

async function seed(): Promise<void> {
  const set = process.env.SET ?? 'all'
  const injected: InjectedName[] = []
  if (set === 'all') {
    injected.push(await seedActive())
    injected.push(await seedGrace('qa-grace-u', 'unwrapped'))
    injected.push(await seedGrace('qa-grace-w', 'wrapped'))
    injected.push(await seedGrace('qa-grace-l', 'locked'))
  } else if (set === 'unwrapped' || set === 'wrapped' || set === 'locked') {
    injected.push(await seedGrace(`qa-grace-${set[0]}`, set))
  } else {
    throw new Error(`Unknown SET=${set} (all | unwrapped | wrapped | locked)`)
  }

  console.log(`\nowner (connect as this): ${owner.address}`)
  for (const n of injected)
    console.log(`  ${`${n.label}.eth`.padEnd(32)} ${n.type}`)
  const value = encodeURIComponent(JSON.stringify(injected))
  console.log(
    '\n1. Paste into the manager devtools console (replaces the tool’s list), then reload:\n',
  )
  console.log(
    `document.cookie = "${COOKIE}=${value}; path=/; max-age=604800; SameSite=Lax"`,
  )
  console.log(
    `\n2. Dev tools → Time travel → Sync\n3. Open ${MANAGER_APP_URL}/migration\n`,
  )
}

async function main() {
  const command = process.argv[2]
  if (command === 'usdc:drain') return moveAllUsdc(owner, holder)
  if (command === 'usdc:restore') return moveAllUsdc(holder, owner)
  return seed()
}

main().then(
  () => process.exit(0),
  (error) => {
    console.error(error)
    process.exit(1)
  },
)
