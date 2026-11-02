/**
 * Wait for the explorer's indexer (bigname) to catch up.
 *
 * Several portal views read bigname rather than the chain: the roles tables,
 * registry history, subnames and activity feeds. A test that writes on-chain
 * and immediately loads such a page can beat the index to it.
 *
 * That race fails *silently and permanently*, which is what makes it worth a
 * helper. The read succeeds and returns no rows, the app treats that as
 * "nothing to show" rather than "not indexed yet", and react-query caches the
 * empty result — so the page stays empty for the rest of the test even once
 * the index catches up. Waiting here is not a sleep-to-fix-flake; it is a
 * precondition, the same as waiting for a transaction receipt.
 *
 * Every wait returns at once when Playwright's route mock answers bigname
 * (`E2E_MOCK_BIGNAME=true`, as in CI).
 */

import type { Address } from 'viem'
import { publicClient } from './anvil-client.js'
import {
  isRealBigname,
  waitForBignameBlock,
  waitForBignameName,
} from './bigname-sync.js'

const BIGNAME_URL = process.env.E2E_BIGNAME_URL ?? 'http://127.0.0.1:5660'

const DEFAULT_TIMEOUT_MS = 60_000

/** Block until bigname has published at least `minBlock` (default: the head). */
export async function waitForIndexedBlock(
  minBlock?: bigint,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<void> {
  return waitForBignameBlock(minBlock, timeoutMs)
}

/**
 * Block until bigname lists the role grants on `resource`. bigname indexes a
 * block whole, so a grant is listed once its block is published.
 */
export async function waitForIndexedRoles(
  _registryAddress: Address,
  _resource: bigint,
  _accounts: Address[] = [],
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<void> {
  return waitForBignameBlock(undefined, timeoutMs)
}

/**
 * Block until bigname serves `address` as a registry — the existence probe
 * `useRegistryDetachImpact` needs before it will report an impact count. A
 * freshly deployed-and-attached subregistry has no subnames to wait on with
 * {@link waitForIndexedName}, so it needs this instead.
 */
export async function waitForIndexedRegistry(
  address: Address,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<void> {
  if (!isRealBigname) return
  const deadline = Date.now() + timeoutMs
  const url = `${BIGNAME_URL}/v1/registries/${publicClient.chain?.id ?? 11155111}/${address.toLowerCase()}`
  while (Date.now() < deadline) {
    const res = await fetch(url).catch(() => null)
    if (res?.ok) return
    await new Promise((resolve) => setTimeout(resolve, 1_000))
  }
  throw new Error(
    `bigname has not indexed registry ${address} after ${timeoutMs}ms`,
  )
}

/**
 * Block until bigname serves `name` — the source the portal's subnames list
 * and name pages read. Waiting on the name itself covers a subname inside a
 * freshly attached subregistry, which a block height alone does not.
 */
export async function waitForIndexedName(
  name: string,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<void> {
  await waitForBignameName(name, () => true, timeoutMs)
}

/**
 * Block until bigname lists `account` as a holder on `resource`. bigname
 * publishes a block's grants and holders together, so the block is enough.
 */
export async function waitForRoleHolder(
  _registryAddress: Address,
  _resource: bigint,
  _account: Address,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<void> {
  return waitForBignameBlock(undefined, timeoutMs)
}
