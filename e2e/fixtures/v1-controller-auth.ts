/**
 * Authorises the canonical V1 ETHRegistrarController on the canonical V1
 * BaseRegistrar — the pair the apps actually read — on the local fork.
 *
 * ## Why this exists
 *
 * `makeV1Name` registers into a *superseded* V1 deployment (`0x64096092…`)
 * while the migration UI resolves `ensBaseRegistrarImplementation` /
 * `ensNameWrapper` through ensjs (`0x57f1887a…` / `0x0635513f…`). Both are live
 * on the fork, so registration succeeds into a registrar nothing reads, and
 * every name the fixture makes is invisible to the app under test. That is the
 * standing blocker on all 59 `G*` migration rows.
 *
 * Measured in iteration 13 (`scripts/probe-v1-*.mts`): the two controllers are
 * the same code twice deployed — identical bytecode size, `register` selector,
 * commitment ages and prices. The only difference is that
 * `base.controllers(canonicalController)` is `false`, so `register` dies in
 * `BaseRegistrarImplementation.onlyController` — a bare `require(...)` with no
 * message, which is why the revert carries no data and reads as "reverted for
 * an unknown reason".
 *
 * Granting it makes `register` work. This module makes that grant a
 * **reproducible step** instead of a probe side effect on one long-lived fork:
 * a fresh `pnpm e2e:infra:up` does not have it, and neither does CI.
 *
 * ## Two grants, two different reasons
 *
 * - `base.controllers(controller)` — required for `register`. Proven.
 * - `base.controllers(nameWrapper)` — required for `wrapETH2LD`, because the
 *   wrapper calls back into the registrar. `false` on the canonical pair and
 *   `true` on the pair the fixture currently uses, which is why unwrapped names
 *   would work after the first grant alone while wrapped and locked names would
 *   not.
 *
 * Do **not** add `wrapper.controllers(controller)`: it is `false` on *both*
 * pairs, including the working one, so it was never a requirement. The fixture
 * wraps by calling `wrapETH2LD` as the owner after an unwrapped registration,
 * not by registering through the controller with the wrapper as owner.
 *
 * ## Idempotence and rule 5
 *
 * Reads before writing, writes only what is missing, and **reads back after**,
 * throwing if the grant did not take. A silent no-op here would put every `G*`
 * scenario back to asserting against a fixture that cannot work — the exact
 * failure `reserveInV2` had.
 */

import { ensL1Contracts, supportedL1Chains } from '@ensdomains/ensjs/chain'
import { type Address, encodeFunctionData, parseAbi } from 'viem'
import {
  publicClient,
  testClient,
  walletClient,
} from '../helpers/anvil-client.js'

const ensjsSepolia = ensL1Contracts[supportedL1Chains.sepolia]

/** The V1 pair the apps read, from the same config the apps read it from. */
export const APP_V1_CONTROLLER = ensjsSepolia.ensEthRegistrarController
  .address as Address
export const APP_V1_BASE_REGISTRAR = ensjsSepolia.ensBaseRegistrarImplementation
  .address as Address
export const APP_V1_NAME_WRAPPER = ensjsSepolia.ensNameWrapper
  .address as Address

const REGISTRAR_ABI = parseAbi([
  'function owner() view returns (address)',
  'function controllers(address) view returns (bool)',
  'function addController(address controller)',
])

const isController = (candidate: Address) =>
  publicClient.readContract({
    address: APP_V1_BASE_REGISTRAR,
    abi: REGISTRAR_ABI,
    functionName: 'controllers',
    args: [candidate],
  })

/**
 * Grant `addController(candidate)` on the canonical BaseRegistrar by
 * impersonating its owner.
 *
 * The owner is a *contract* (`ensEthRenewerV1` on this fork, since
 * contracts-v2's `transferRegistrarOwnership` hands the V1 registrar to the V2
 * renewer). Anvil impersonation sends the transaction *as* that address without
 * executing its code, which is what makes this possible at all.
 */
async function grant(candidate: Address, what: string): Promise<void> {
  const owner = await publicClient.readContract({
    address: APP_V1_BASE_REGISTRAR,
    abi: REGISTRAR_ABI,
    functionName: 'owner',
  })

  await testClient.setBalance({ address: owner, value: 10n ** 18n })
  await testClient.impersonateAccount({ address: owner })
  try {
    const hash = await walletClient.sendTransaction({
      account: owner,
      to: APP_V1_BASE_REGISTRAR,
      data: encodeFunctionData({
        abi: REGISTRAR_ABI,
        functionName: 'addController',
        args: [candidate],
      }),
    })
    const receipt = await publicClient.waitForTransactionReceipt({ hash })
    if (receipt.status !== 'success') {
      throw new Error(
        `addController(${candidate}) for ${what} reverted (tx ${hash})`,
      )
    }
  } finally {
    await testClient.stopImpersonatingAccount({ address: owner })
  }

  // Rule 5: read the postcondition back, independently of the write.
  if (!(await isController(candidate))) {
    throw new Error(
      `addController(${candidate}) for ${what} reported success but ${APP_V1_BASE_REGISTRAR}.controllers(${candidate}) is still false — the grant did not take, and every V1 fixture built on it would fail in onlyController with a data-less revert`,
    )
  }
}

let inFlight: Promise<void> | undefined

/**
 * Idempotent on **chain state**, not on process lifetime — every call reads
 * `controllers(candidate)` fresh and only sends a grant for what is actually
 * missing right now. Safe to call from any fixture that needs to write to the
 * canonical V1 deployment.
 *
 * Deliberately does NOT cache "already granted" across calls: a caller that
 * wraps its own test in `evm_snapshot`/`evm_revert` (as the harness gate does)
 * rolls the grant back on-chain when it reverts, and a process-lifetime cache
 * would then lie to every later call in the same worker, letting `register()`
 * sail into a data-less `onlyController` revert. `inFlight` here only
 * collapses concurrent callers onto one read-modify-write pass; it is not a
 * "done forever" flag.
 */
export function ensureV1ControllersAuthorised(): Promise<void> {
  inFlight = (inFlight ?? Promise.resolve()).then(async () => {
    const targets: [Address, string][] = [
      [APP_V1_CONTROLLER, 'ETHRegistrarController (register)'],
      [APP_V1_NAME_WRAPPER, 'NameWrapper (wrapETH2LD)'],
    ]
    for (const [candidate, what] of targets) {
      if (await isController(candidate)) continue
      console.log(`[v1-auth] granting addController → ${what} (${candidate})`)
      await grant(candidate, what)
    }
  })
  return inFlight
}

/** Current state of both grants — for the harness gate to assert on. */
export async function v1ControllerAuthState(): Promise<{
  controller: boolean
  nameWrapper: boolean
}> {
  return {
    controller: await isController(APP_V1_CONTROLLER),
    nameWrapper: await isController(APP_V1_NAME_WRAPPER),
  }
}
