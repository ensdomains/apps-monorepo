/**
 * Wait for Panoptes to catch up — part of plan item H6.
 *
 * Several portal views read the indexer rather than the chain: the roles
 * tables, registry history, activity feeds. Panoptes polls every 2s
 * (`POLL_INTERVAL` in `infra/docker-compose.yml`), so a test that writes
 * on-chain and immediately loads such a page can beat the indexer to it.
 *
 * That race fails *silently and permanently*, which is what makes it worth a
 * helper. The GraphQL call succeeds and returns no rows, the app treats that
 * as "nothing to show" rather than "not indexed yet", and react-query caches
 * the empty result — so the page stays empty for the rest of the test even
 * once the indexer catches up. Waiting here is not a sleep-to-fix-flake; it
 * is a precondition, the same as waiting for a transaction receipt.
 *
 * Prefer {@link waitForIndexedResource}: it waits for the exact data the
 * assertion needs. {@link waitForIndexedBlock} is the blunt version for cases
 * with no single identifying resource.
 */

import type { Address } from 'viem'
import { publicClient } from './anvil-client.js'
import { waitForBignameBlock, waitForBignameName } from './bigname-sync.js'

/**
 * Whether the explorer reads bigname rather than Panoptes (#1354). Then every
 * wait below follows bigname, which is what the page under test reads; the
 * Panoptes waits stay for an explorer built before that PR.
 */
export const explorerReadsBigname =
  process.env.E2E_EXPLORER_INDEXER === 'bigname'

const BIGNAME_URL = process.env.E2E_BIGNAME_URL ?? 'http://127.0.0.1:5660'

const INDEXER_URL =
  process.env.E2E_INDEXER_GRAPHQL_URL ?? 'http://127.0.0.1:5655/graphql'

const DEFAULT_TIMEOUT_MS = 60_000
const POLL_MS = 1_000

async function query<T>(gql: string): Promise<T | null> {
  try {
    const res = await fetch(INDEXER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: gql }),
    })
    if (!res.ok) return null
    const json = (await res.json()) as { data?: T; errors?: unknown }
    return json.errors ? null : (json.data ?? null)
  } catch {
    // The indexer being unreachable is a legitimate state for the caller to
    // wait through — it may still be starting.
    return null
  }
}

/** Highest block Panoptes has an event for, or null if it is unreachable. */
async function newestIndexedBlock(): Promise<number | null> {
  const data = await query<{ events: { blockNumber: number }[] }>(
    `{ events(first: 1, orderBy: "blockNumber", orderDirection: "desc") { blockNumber } }`,
  )
  return data?.events?.[0]?.blockNumber ?? null
}

/**
 * Block until Panoptes has indexed at least up to the current chain head.
 *
 * Only meaningful when the chain head *has* an indexable event on it — the
 * indexer's own cursor is not exposed over GraphQL, so this infers progress
 * from the newest event it holds. After a write that emits events (any
 * registration, grant or revoke) that inference is sound.
 */
export async function waitForIndexedBlock(
  minBlock?: bigint,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<void> {
  if (explorerReadsBigname) return waitForBignameBlock(minBlock, timeoutMs)
  const target = minBlock ?? (await publicClient.getBlockNumber())
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const newest = await newestIndexedBlock()
    if (newest !== null && BigInt(newest) >= target) return
    await new Promise((r) => setTimeout(r, POLL_MS))
  }
  throw new Error(
    `Panoptes did not reach block ${target} within ${timeoutMs}ms ` +
      `(newest indexed: ${await newestIndexedBlock()}). ` +
      `Is its contract manifest current? See e2e/infra/panoptes/contracts.json.`,
  )
}

/**
 * Block until Panoptes holds `EACRolesChanged` events for `resource` on
 * `registryAddress` — the exact query
 * `features/roles/hooks/useNameRoleAccounts.ts` runs.
 *
 * **Pass every account the assertion depends on.** Waiting for the resource
 * alone is not enough: registering a name already emits an event for its
 * owner, so that wait is satisfied the instant the name exists, while a grant
 * made afterwards may still be unindexed. A test that then asserts the
 * grantee's row fails intermittently — which is exactly how this was found.
 */
export async function waitForIndexedRoles(
  registryAddress: Address,
  resource: bigint,
  accounts: Address[] = [],
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<void> {
  // bigname indexes a block whole, so a grant is listed once its block is.
  if (explorerReadsBigname) return waitForBignameBlock(undefined, timeoutMs)
  const wanted = `0x${resource.toString(16).padStart(64, '0')}`.toLowerCase()
  const required = accounts.map((a) => a.toLowerCase())
  const deadline = Date.now() + timeoutMs
  let seen = 0
  let found = new Set<string>()

  while (Date.now() < deadline) {
    const data = await query<{ events: { data: string }[] }>(
      `{ events(where: { type: "EACRolesChanged", contractAddress: "${registryAddress.toLowerCase()}" },
                first: 1000, orderBy: "blockNumber", orderDirection: "desc") { data } }`,
    )
    const events = data?.events ?? []
    seen = events.length

    found = new Set<string>()
    for (const event of events) {
      const payload = JSON.parse(event.data) as {
        resource?: string
        account?: string
      }
      if (payload.resource?.toLowerCase() !== wanted) continue
      if (payload.account) found.add(payload.account.toLowerCase())
    }

    if (found.size > 0 && required.every((a) => found.has(a))) return
    await new Promise((r) => setTimeout(r, POLL_MS))
  }

  const missing = required.filter((a) => !found.has(a))
  throw new Error(
    `Panoptes has not indexed roles for ${wanted} on ${registryAddress} after ${timeoutMs}ms ` +
      `(${seen} events for that registry, ${found.size} accounts on this resource` +
      `${missing.length > 0 ? `, missing ${missing.join(', ')}` : ''}). ` +
      `Zero events for the registry means its contract manifest is stale — see ` +
      `e2e/infra/panoptes/contracts.json.`,
  )
}

/**
 * Block until Panoptes knows about `address` as a registry — the existence
 * probe `useRegistryDetachImpact` runs (`registry(address:) { labelCount }`
 * in `getRegistryOccupants`) before it will report an impact count.
 *
 * A freshly deployed-and-attached subregistry has no subnames to wait on with
 * {@link waitForIndexedName} — it needs this instead. Same underlying cause as
 * that helper's own note: Panoptes only learns a subregistry exists once it
 * sees the `setSubregistry` event, so a registry can be several blocks old,
 * with the indexer at chain head, and still answer `null` (which the app
 * treats as "can't size this", not "empty" — fail closed, so the transfer
 * step stays blocked rather than proceeding on an unknown blast radius).
 */
export async function waitForIndexedRegistry(
  address: Address,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<void> {
  if (explorerReadsBigname) return waitForBignameRegistry(address, timeoutMs)
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const data = await query<{ registry: { labelCount: number } | null }>(
      `{ registry(address: "${address.toLowerCase()}") { labelCount } }`,
    )
    if (data?.registry != null) return
    await new Promise((r) => setTimeout(r, POLL_MS))
  }
  throw new Error(
    `Panoptes has not discovered registry ${address} after ${timeoutMs}ms. ` +
      `A freshly attached subregistry is only discovered once Panoptes sees ` +
      `its setSubregistry event — see waitForIndexedName's header comment.`,
  )
}

/**
 * Block until Panoptes lists `name` in its `domains` table — the source the
 * portal's subnames list reads through `useSubnames`.
 *
 * Names inside a subregistry need more than a current block height. Panoptes
 * only learns a subregistry exists when it sees the `setSubregistry` event,
 * and then backfills that registry's history as a separate step ("Backfilling
 * N newly discovered subregistry" in its log). So a subname can be several
 * blocks old, with the indexer at chain head, and still be absent. Waiting on
 * the name itself is the only wait that actually covers it.
 */
export async function waitForIndexedName(
  name: string,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<void> {
  if (explorerReadsBigname) {
    await waitForBignameName(name, () => true, timeoutMs)
    return
  }
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const data = await query<{ domains: { name: string }[] }>(
      `{ domains(where: { name: "${name}" }) { name } }`,
    )
    if ((data?.domains?.length ?? 0) > 0) return
    await new Promise((r) => setTimeout(r, POLL_MS))
  }
  throw new Error(
    `Panoptes has not indexed ${name} after ${timeoutMs}ms. ` +
      `For a name inside a subregistry this usually means the registry has ` +
      `not been discovered and backfilled yet.`,
  )
}

/**
 * Wait until Panoptes' role-holder table (`roleConnection`, the query the
 * explorer's transfer and roles pages read) lists `account` on `resource`.
 *
 * Distinct from `waitForIndexedRoles`, which reads the event log: the event
 * lands first and the holder table catches up later. The explorer cross-checks
 * the holder table against the registry (`useNameRoleAccounts`), so reading it
 * early fails as `registry-mismatch` and the transfer page refuses to send.
 */
export async function waitForRoleHolder(
  registryAddress: Address,
  resource: bigint,
  account: Address,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<void> {
  if (explorerReadsBigname) return waitForBignameBlock(undefined, timeoutMs)
  const resourceHex = `0x${resource.toString(16).padStart(64, '0')}`
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const data = await query<{
      roleConnection: { edges: { node: { account: string } }[] } | null
    }>(
      `{ roleConnection(contract: "${registryAddress.toLowerCase()}", resource: "${resourceHex}", first: 50) { edges { node { account } } } }`,
    )
    const holders = data?.roleConnection?.edges ?? []
    if (
      holders.some(
        (edge) => edge.node.account.toLowerCase() === account.toLowerCase(),
      )
    )
      return
    await new Promise((resolve) => setTimeout(resolve, 1_000))
  }
  throw new Error(
    `Panoptes' role-holder table does not list ${account} on ${resourceHex} after ${timeoutMs}ms`,
  )
}

/**
 * Whether Panoptes' root role-holder list for `registryAddress` fits in the
 * one page the explorer reads (`lib/roles/roleHolders.ts`, 1000 rows). When it
 * does not, the explorer marks the list truncated and refuses every transfer
 * ("Couldn't check who else holds permissions on this name"). The local
 * Panoptes lists ~900 root holders where the hosted one lists 5
 * (e2e-defects.md, "Local Panoptes root role holders").
 */
export async function explorerCanReadRootHolders(
  registryAddress: Address,
): Promise<boolean> {
  const data = await query<{
    roleConnection: { pageInfo: { hasNextPage: boolean } } | null
  }>(
    `{ roleConnection(contract: "${registryAddress.toLowerCase()}", resource: "0x${'0'.repeat(64)}", first: 1000) { pageInfo { hasNextPage } } }`,
  )
  return data?.roleConnection?.pageInfo.hasNextPage === false
}

/** Wait until bigname serves the registry at `address` (its detail route). */
async function waitForBignameRegistry(
  address: Address,
  timeoutMs: number,
): Promise<void> {
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
