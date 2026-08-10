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
