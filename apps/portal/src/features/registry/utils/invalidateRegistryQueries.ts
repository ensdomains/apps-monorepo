/**
 * Invalidate the registry-derived caches a role grant or revoke affects.
 *
 * Every key here reads the indexer, which lags a confirmed transaction by a
 * few blocks, so callers invalidate once on success and then poll until it
 * catches up. The role holder and history reads fall back to a node
 * log scan only when the indexer fails, so polling them is cheap in the normal
 * case and correct in the fallback case.
 *
 * What does NOT need invalidating on a role mutation:
 *  - `get-registry-label-count` — labelCount is unchanged by role changes.
 *  - `nameRegistries` / `nameRegistry` — name→registry lookups, unrelated.
 *  - `registry-referenced-by` — derived from `SubregistryUpdated` logs, not
 *    from EAC role state.
 */

import type { QueryClient } from '@tanstack/react-query'

/** Read from the indexer: needs polling until it catches up. */
const INDEXER_BACKED_KEYS = new Set<string>([
  // Holders table on /registry/$address/roles.
  'get-registry-root-role-holders',
  // Per-user role-change history embedded in the edit sheet.
  'get-registry-role-history-for-account',
  // Registry overview (roleCount on RegistryInfo).
  'get-registry-info',
  // Full per-registry event feed used by /registry/$address/history.
  'get-registry-events',
  // Labels table — its `roleHoldersCount` column reads `registry.roles`.
  'get-registry-labels',
])

/**
 * Everything a role change touches. Call once on success, then hand it to
 * `pollForIndexerSync` until the indexer catches up.
 */
export const invalidateRegistryQueries = (
  queryClient: QueryClient,
): Promise<void> =>
  queryClient.invalidateQueries({
    predicate: (query) => INDEXER_BACKED_KEYS.has(query.queryKey[0] as string),
    refetchType: 'all',
  })
