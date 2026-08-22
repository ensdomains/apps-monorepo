/**
 * Stale V1 manager privilege resurrection — end-to-end reproduction.
 *
 * Manager restores the legacy V1 "manager" (the ENSRegistry `owner(node)` delegate)
 * after migration by granting it ROLE_SET_RESOLVER on the V2 name. It learns who that
 * manager is from the **V1 subgraph** — an off-chain index, cached in the browser for
 * five minutes — and never confirms the address against the live legacy registry.
 *
 * Every other input to the migration plan IS read live: `BaseRegistrar.ownerOf` proves
 * the wallet holds the registration, `getStatus` proves the V2 slot is RESERVED. The one
 * value that becomes an authorization grant is the only one taken on faith.
 *
 * So when the live manager and the indexed manager disagree — the ordinary consequence of
 * subgraph lag after a `reclaim()` — Manager builds a wallet-signed batch that hands
 * resolver control of the victim's name to an address that no longer holds any V1 role.
 *
 * This spec creates that divergence with real on-chain state:
 *
 *   1. VICTIM registers an unwrapped V1 name (real BaseRegistrar mint on the fork).
 *   2. VICTIM delegates the registry manager role to ATTACKER — the pre-sale state.
 *   3. VICTIM calls `reclaim()`, revoking it. Live `ENSRegistry.owner(node)` is VICTIM.
 *   4. The mocked subgraph still reports ATTACKER as manager — a lagging index.
 *   5. VICTIM migrates through the real UI on localhost:3000.
 *
 * The assertion is on-chain, not on the DOM. Before the fix, ATTACKER — who owns nothing
 * and controls nothing in V1 — came out of this holding ROLE_SET_RESOLVER on the victim's
 * V2 name (bitmap 0x1000000), free to point it at any resolver they liked.
 *
 * `resolveLiveManagers` now confirms every manager against `ENSRegistry.owner(node)`
 * before it can reach the batch builder, so the grant is dropped. The migration itself
 * must still succeed — this guards against fixing the leak by breaking the flow.
 *
 * Prerequisites (same as migration.spec.ts):
 *   - Local stack up:      pnpm --filter @ens-apps/e2e infra:up
 *   - Manager app running: http://localhost:3000
 */
import {
  type Address,
  encodeFunctionData,
  keccak256,
  namehash,
  parseAbi,
  toHex,
} from 'viem'
import { privateKeyToAccount } from 'viem/accounts'

import {
  createMakeV1Name,
  V1_BASE_REGISTRAR,
  V1_ENS_REGISTRY,
} from '../../../fixtures/makeV1Name.js'
import {
  authorizeTransactionsWhile,
  expect,
  test,
} from '../../../fixtures/playwright.manager.fixture.js'
import { publicClient, walletClient } from '../../../helpers/anvil-client.js'
import {
  assertHasRoles,
  assertLacksRoles,
  assertV2Registered,
  REGISTRY_ROLES,
} from '../../../helpers/migration-assertions.js'
import { mockV1Subgraph } from '../../../helpers/mock-v1-subgraph.js'

const MANAGER_APP_URL = process.env.MANAGER_APP_URL ?? 'http://localhost:3000'

/**
 * The former manager. Never owns the registration, and by migration time holds no V1
 * role whatsoever — it exists only in the stale snapshot. Deliberately not an Anvil
 * mnemonic account: nothing in the test can act as it, so any privilege it ends up
 * with was handed over by Manager itself.
 */
const ATTACKER: Address = '0x00000000000000000000000000000000000000c1'

/** A manager that is still live at migration time — the legitimate delegation case. */
const LIVE_MANAGER: Address = '0x00000000000000000000000000000000000000d1'

const ENS_REGISTRY_ABI = parseAbi([
  'function owner(bytes32 node) view returns (address)',
  'function setOwner(bytes32 node, address owner)',
])

const BASE_REGISTRAR_ABI = parseAbi([
  'function reclaim(uint256 id, address owner)',
])

const waitForTx = async (hash: `0x${string}`) =>
  publicClient.waitForTransactionReceipt({ hash })

/**
 * Drive the migration UI to its success screen.
 *
 * The dashboard CTA reads "Upgrade Names" on a wallet with nothing migrated yet, and
 * "Complete Upgrade" once some names already moved — the state any repeat run on a
 * shared fork lands in. The review step's CTA is count-labelled ("Upgrade 1 name").
 *
 * Wallet confirmations are drained rather than counted: restoring a manager adds one on
 * top of the baseline migration, so the total differs between these two tests.
 */
async function runMigration(
  page: import('@playwright/test').Page,
  wallet: Parameters<typeof authorizeTransactionsWhile>[1],
): Promise<void> {
  await page.goto(`${MANAGER_APP_URL}/dashboard`)
  await page.waitForLoadState('networkidle')

  const upgradeButton = page
    .getByRole('button', { name: /Upgrade Names|Complete Upgrade/ })
    .first()
  await upgradeButton.waitFor({ state: 'visible', timeout: 10_000 })
  await upgradeButton.click()
  await page.waitForTimeout(2_000)

  const confirmButton = page.getByRole('button', { name: /^Upgrade \d+ name/ })
  await confirmButton.waitFor({ state: 'visible', timeout: 10_000 })

  let done = false
  await Promise.all([
    (async () => {
      await confirmButton.click()
      // Single-name migrations land on "Your name has been upgraded!"; the batch
      // flow says "You're on ENS v2!". Accept either.
      await page
        .getByText(/Your names? (has|have) been upgraded!|You're on ENS v2!/)
        .first()
        .waitFor({ state: 'visible', timeout: 180_000 })
      done = true
    })(),
    authorizeTransactionsWhile(page, wallet, () => done),
  ])
}

// ---------------------------------------------------------------------------

test.describe('Migration — stale V1 manager privilege resurrection', () => {
  test.describe.configure({ timeout: 300_000 })

  test('grants nothing to a manager the victim already revoked', async ({
    migrationConnectedPage: page,
    wallet,
    accounts,
  }) => {
    const victimKey = accounts.getPrivateKey('user')
    const victimAccount = privateKeyToAccount(victimKey)
    const VICTIM = victimAccount.address

    // ── 1. VICTIM registers a real unwrapped V1 name ────────────────────
    const makeV1Name = createMakeV1Name({ userAccount: victimAccount })
    const v1Name = await makeV1Name({ label: 'stalemgr' })
    const label = v1Name.replace(/\.eth$/, '')
    const node = namehash(v1Name)
    const tokenId = BigInt(keccak256(toHex(label)))
    console.log(
      `[stale-manager] V1 name registered: ${v1Name} → registrant ${VICTIM}`,
    )

    // ── 2. Delegate the manager role to ATTACKER ────────────────────────
    // Models the seller-era state the subgraph indexes: registrant and manager differ.
    await waitForTx(
      await walletClient.sendTransaction({
        account: victimAccount,
        to: V1_ENS_REGISTRY,
        data: encodeFunctionData({
          abi: ENS_REGISTRY_ABI,
          functionName: 'setOwner',
          args: [node, ATTACKER],
        }),
      }),
    )
    expect(
      (
        await publicClient.readContract({
          address: V1_ENS_REGISTRY,
          abi: ENS_REGISTRY_ABI,
          functionName: 'owner',
          args: [node],
        })
      ).toLowerCase(),
      'ATTACKER should be the live V1 manager at snapshot time',
    ).toBe(ATTACKER.toLowerCase())
    console.log(
      `[stale-manager] manager delegated to ${ATTACKER} (snapshot state)`,
    )

    // ── 3. VICTIM reclaims — the delegation is revoked on-chain ─────────
    await waitForTx(
      await walletClient.sendTransaction({
        account: victimAccount,
        to: V1_BASE_REGISTRAR,
        data: encodeFunctionData({
          abi: BASE_REGISTRAR_ABI,
          functionName: 'reclaim',
          args: [tokenId, VICTIM],
        }),
      }),
    )

    // Ground truth from here on: the attacker holds nothing in V1.
    const liveManager = (await publicClient.readContract({
      address: V1_ENS_REGISTRY,
      abi: ENS_REGISTRY_ABI,
      functionName: 'owner',
      args: [node],
    })) as Address
    expect(
      liveManager.toLowerCase(),
      'after reclaim() the live V1 manager must be the victim',
    ).toBe(VICTIM.toLowerCase())
    console.log(
      `[stale-manager] reclaim() done — live V1 manager is now ${VICTIM}`,
    )

    // ── 4. The subgraph has not caught up ───────────────────────────────
    // This is the entire exploit primitive: one stale field, served by an index the app
    // trusts without verification. No compromised key, no malicious dependency.
    await mockV1Subgraph(page, [
      { name: v1Name, ownerAddress: VICTIM, managerAddress: ATTACKER },
    ])
    console.log(
      `[stale-manager] subgraph still reports manager=${ATTACKER} (stale)`,
    )

    // ── 5. VICTIM migrates through the real UI ──────────────────────────
    // The confirmation step says only "Restore the existing managers for your names."
    // It never names the address, so there is nothing here for the victim to catch.
    await runMigration(page, wallet)
    console.log('[stale-manager] migration reported success by the app')

    // ── 6. On-chain outcome ─────────────────────────────────────────────
    await assertV2Registered(label)

    // The victim still owns the name and can still set its resolver.
    await assertHasRoles(label, VICTIM, REGISTRY_ROLES.ROLE_SET_RESOLVER)

    // The revoked manager gets nothing. Before the fix this address held 0x1000000
    // (ROLE_SET_RESOLVER) purely because the subgraph snapshot still named it.
    await assertLacksRoles(label, ATTACKER, REGISTRY_ROLES.ROLE_SET_RESOLVER)

    console.log(
      `[stale-manager] ✅ ${ATTACKER} holds no roles on ${v1Name}; ` +
        `plan followed the live V1 manager (${liveManager}), not the stale snapshot`,
    )
  })

  test('still restores a manager the live registry confirms', async ({
    migrationConnectedPage: page,
    wallet,
    accounts,
  }) => {
    // Counter-check to the test above: the fix must drop only *stale* managers. A
    // delegation that is still live on chain is a real one the user set, and migration
    // is supposed to carry it into V2 — dropping it would be a silent feature removal
    // dressed up as a security fix.
    const victimAccount = privateKeyToAccount(accounts.getPrivateKey('user'))
    const VICTIM = victimAccount.address

    const makeV1Name = createMakeV1Name({ userAccount: victimAccount })
    const v1Name = await makeV1Name({ label: 'livemgr' })
    const label = v1Name.replace(/\.eth$/, '')
    const node = namehash(v1Name)

    // Delegate to LIVE_MANAGER and — unlike the stale case — never reclaim it.
    await waitForTx(
      await walletClient.sendTransaction({
        account: victimAccount,
        to: V1_ENS_REGISTRY,
        data: encodeFunctionData({
          abi: ENS_REGISTRY_ABI,
          functionName: 'setOwner',
          args: [node, LIVE_MANAGER],
        }),
      }),
    )
    const liveManager = (await publicClient.readContract({
      address: V1_ENS_REGISTRY,
      abi: ENS_REGISTRY_ABI,
      functionName: 'owner',
      args: [node],
    })) as Address
    expect(liveManager.toLowerCase()).toBe(LIVE_MANAGER.toLowerCase())

    // Snapshot and chain agree here — nothing stale about this one.
    await mockV1Subgraph(page, [
      { name: v1Name, ownerAddress: VICTIM, managerAddress: LIVE_MANAGER },
    ])

    await runMigration(page, wallet)
    await assertV2Registered(label)

    await assertHasRoles(label, LIVE_MANAGER, REGISTRY_ROLES.ROLE_SET_RESOLVER)
    console.log(
      `[live-manager] ✅ ${LIVE_MANAGER} kept ROLE_SET_RESOLVER on ${v1Name}`,
    )
  })
})
