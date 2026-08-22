/**
 * Does a migration plan survive a manager revocation that happens AFTER it was built?
 *
 * `resolveLiveManagers` confirms the manager against the live legacy registry — but it
 * runs inside `buildMigrationPlan`, which has a single call site: the cached query in
 * `useMigrationGasEstimate`. That query is keyed on `[owner, hca, domainIds, revision]`,
 * and `revision` only advances when the *selection* changes. Authority is not part of
 * the key.
 *
 * So the live check is a check at PLAN-BUILD time, not at signing time. This test opens
 * that gap deliberately:
 *
 *   1. The attacker is the genuine live V1 manager. The plan is built — the grant is
 *      CORRECT at this moment, and `resolveLiveManagers` rightly keeps it.
 *   2. The victim reclaims. The attacker now holds nothing.
 *   3. The victim signs the plan that was built in step 1.
 *
 * Nothing here is stale in the sense report #89249 described: the subgraph is never
 * behind, and the live read returned the truth when it ran. The question is only whether
 * the plan is rebuilt — or revalidated — before it is signed.
 */

import { labelToCanonicalId } from '@ensdomains/ensjs/utils/v2'
import {
  type Address,
  encodeFunctionData,
  keccak256,
  namehash,
  parseAbi,
  toHex,
} from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { V2_CONTRACTS } from '../../../../apps/manager/src/features/migration/contracts/addresses.js'
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
  assertV2Registered,
  REGISTRY_ROLES,
} from '../../../helpers/migration-assertions.js'
import { mockV1Subgraph } from '../../../helpers/mock-v1-subgraph.js'

const MANAGER_APP_URL = process.env.MANAGER_APP_URL ?? 'http://localhost:3000'

const ENS_REGISTRY_ABI = parseAbi([
  'function owner(bytes32 node) view returns (address)',
])
const BASE_REGISTRAR_ABI = parseAbi([
  'function reclaim(uint256 id, address owner)',
])
const V2_ABI = parseAbi([
  'function roles(uint256 resource, address account) view returns (uint256)',
])

const waitForTx = (hash: `0x${string}`) =>
  publicClient.waitForTransactionReceipt({ hash })

test.describe('Migration — plan built before a revocation', () => {
  test.describe.configure({ timeout: 300_000 })

  test('is the cached plan revalidated before signing?', async ({
    migrationConnectedPage: page,
    wallet,
    accounts,
  }) => {
    const victim = privateKeyToAccount(accounts.getPrivateKey('user'))
    const attacker = privateKeyToAccount(accounts.getPrivateKey('user2'))

    const makeV1Name = createMakeV1Name({ userAccount: victim })
    const v1Name = await makeV1Name({ label: 'planstale' })
    const label = v1Name.replace(/\.eth$/, '')
    const node = namehash(v1Name)
    const tokenId = BigInt(keccak256(toHex(label)))

    // ── Attacker is the GENUINE live manager ────────────────────────────
    await waitForTx(
      await walletClient.sendTransaction({
        account: victim,
        to: V1_ENS_REGISTRY,
        data: encodeFunctionData({
          abi: parseAbi(['function setOwner(bytes32,address)']),
          functionName: 'setOwner',
          args: [node, attacker.address],
        }),
      }),
    )
    expect(
      await publicClient.readContract({
        address: V1_ENS_REGISTRY,
        abi: ENS_REGISTRY_ABI,
        functionName: 'owner',
        args: [node],
      }),
    ).toBe(attacker.address)

    // The subgraph is truthful here — it agrees with the chain.
    await mockV1Subgraph(page, [
      {
        name: v1Name,
        ownerAddress: victim.address,
        managerAddress: attacker.address,
      },
    ])

    // ── 1. Build the plan while that manager is still valid ─────────────
    await page.goto(`${MANAGER_APP_URL}/dashboard`)
    await page.waitForLoadState('networkidle')
    const upgradeButton = page
      .getByRole('button', { name: /Upgrade Names|Complete Upgrade/ })
      .first()
    await upgradeButton.waitFor({ state: 'visible', timeout: 15_000 })
    await upgradeButton.click()

    const confirmButton = page.getByRole('button', {
      name: /^Upgrade \d+ name/,
    })
    await confirmButton.waitFor({ state: 'visible', timeout: 20_000 })
    // Let the gas/plan query settle so the plan is definitely cached.
    await page.waitForTimeout(4_000)
    console.log('[plan-stale] plan built while attacker was the live manager')

    // ── 2. Victim reclaims — attacker now holds nothing ─────────────────
    await waitForTx(
      await walletClient.sendTransaction({
        account: victim,
        to: V1_BASE_REGISTRAR,
        data: encodeFunctionData({
          abi: BASE_REGISTRAR_ABI,
          functionName: 'reclaim',
          args: [tokenId, victim.address],
        }),
      }),
    )
    const liveManager = await publicClient.readContract({
      address: V1_ENS_REGISTRY,
      abi: ENS_REGISTRY_ABI,
      functionName: 'owner',
      args: [node],
    })
    expect(liveManager).toBe(victim.address)
    console.log(
      `[plan-stale] reclaimed — live V1 manager is now ${victim.address}`,
    )

    // ── 3. Sign the plan built in step 1 ────────────────────────────────
    let done = false
    await Promise.all([
      (async () => {
        await confirmButton.click()
        await page
          .getByText(/Your names? (has|have) been upgraded!|You're on ENS v2!/)
          .first()
          .waitFor({ state: 'visible', timeout: 180_000 })
        done = true
      })(),
      authorizeTransactionsWhile(page, wallet, () => done),
    ])

    await assertV2Registered(label)

    const bitmap = await publicClient.readContract({
      address: V2_CONTRACTS.ETHRegistry,
      abi: V2_ABI,
      functionName: 'roles',
      args: [labelToCanonicalId(label), attacker.address],
    })
    const hasSetResolver = (bitmap & REGISTRY_ROLES.ROLE_SET_RESOLVER) !== 0n
    console.log(
      `[plan-stale] attacker ${attacker.address} bitmap=0x${bitmap.toString(16)} ` +
        `SET_RESOLVER=${hasSetResolver ? 'YES — plan was NOT revalidated' : 'no — plan was rebuilt'}`,
    )

    expect(
      hasSetResolver,
      'a manager revoked after the plan was built must not receive ROLE_SET_RESOLVER',
    ).toBe(false)
  })
})
