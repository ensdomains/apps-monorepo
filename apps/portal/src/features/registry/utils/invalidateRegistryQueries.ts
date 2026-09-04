/**
 * Invalidate the registry-derived caches a role grant or revoke affects.
 *
 * Split by data source. The log-backed reads are correct the moment the
 * transaction confirms, so they are invalidated once; the indexer-backed ones
 * lag and are polled, and re-running a log scan on every poll tick would cost
 * a full rescan of the registry for nothing.
 *
 * What does NOT need invalidating on a role mutation:
 *  - `get-registry-label-count` — labelCount is unchanged by role changes.
 *  - `nameRegistries` / `nameRegistry` — name→registry lookups, unrelated.
 *  - `registry-referenced-by` — derived from `SubregistryUpdated` logs, not
 *    from EAC role state.
 */

import type { QueryClient } from '@tanstack/react-query'

/** Read from logs: current as soon as the transaction confirms. */
const LOG_BACKED_KEYS = new Set<string>([
  // Holders table on /registry/$address/roles.
  'get-registry-root-role-holders',
  // Per-user role-change history embedded in the edit sheet.
  'get-registry-role-history-for-account',
])

/** Read from the indexer: needs polling until it catches up. */
const INDEXER_BACKED_KEYS = new Set<string>([
  // Registry overview (roleCount on RegistryInfo).
  'get-registry-info',
  // Full per-registry event feed used by /registry/$address/history.
  'get-registry-events',
  // Labels table — its `roleHoldersCount` column reads `registry.roles`.
  'get-registry-labels',
])

const invalidate = (
  queryClient: QueryClient,
  keys: ReadonlySet<string>,
): Promise<void> =>
  queryClient.invalidateQueries({
    predicate: (query) => keys.has(query.queryKey[0] as string),
    refetchType: 'all',
  })

/** Everything a role change touches. Call once, on success. */
export const invalidateRegistryQueries = (
  queryClient: QueryClient,
): Promise<void> =>
  invalidate(queryClient, new Set([...LOG_BACKED_KEYS, ...INDEXER_BACKED_KEYS]))

/** The polled subset. Safe to call repeatedly while the indexer catches up. */
export const invalidateIndexedRegistryQueries = (
  queryClient: QueryClient,
): Promise<void> => invalidate(queryClient, INDEXER_BACKED_KEYS)
