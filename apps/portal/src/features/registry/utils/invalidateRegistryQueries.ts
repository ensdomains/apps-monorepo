/**
 * Invalidate the registry-derived caches a role grant or revoke affects.
 *
 * Split by data source. The log-backed reads are correct the moment the
 * transaction confirms, so they are invalidated once; the indexer-backed ones
 * lag and are refreshed again once bigname has indexed the transaction.
 *
 * The root role reads are either: log-backed against bigname v0.4.1, and
 * indexer-backed where bigname serves them (`rootRoleReads.ts`). They join the
 * second refresh only in the latter case, where it is needed; against v0.4.1
 * it would rescan the registry's logs for nothing.
 *
 * What does NOT need invalidating on a role mutation:
 *  - `get-registry-label-count` — labelCount is unchanged by role changes.
 *  - `nameRegistries` / `nameRegistry` — name→registry lookups, unrelated.
 *  - `registry-referenced-by` — derived from `SubregistryUpdated` logs, not
 *    from EAC role state.
 */

import type { QueryClient } from '@tanstack/react-query'
import { rootRoleReadsSupportedQueryKey } from '@/lib/roles/rootRoleReads'

/** Root role reads: from logs, or from bigname where it serves them. */
const ROOT_ROLE_KEYS = new Set<string>([
  // Holders table on /registry/$address/roles.
  'get-registry-root-role-holders',
  // Per-user role-change history embedded in the edit sheet.
  'get-registry-role-history-for-account',
])

/** Read from bigname: needs polling until it has indexed the transaction. */
const INDEXER_BACKED_KEYS = new Set<string>([
  // Registry overview (`counts.roles` on RegistryInfo).
  'get-registry-info',
  // The registry's own event feed, used by /registry/$address/history.
  'get-registry-history-timeline',
  // Labels table — its `roleHoldersCount` column reads `role_holder_count`.
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
  invalidate(queryClient, new Set([...ROOT_ROLE_KEYS, ...INDEXER_BACKED_KEYS]))

/** The indexed subset. Call once bigname has caught up with the transaction. */
export const invalidateIndexedRegistryQueries = (
  queryClient: QueryClient,
): Promise<void> => {
  const areRootRolesIndexed =
    queryClient.getQueryData(rootRoleReadsSupportedQueryKey()) === true
  return invalidate(
    queryClient,
    areRootRolesIndexed
      ? new Set([...ROOT_ROLE_KEYS, ...INDEXER_BACKED_KEYS])
      : INDEXER_BACKED_KEYS,
  )
}

/** Read from bigname, and changed when a label is created or deleted. */
const LABEL_BACKED_KEYS = new Set<string>([
  // Overview `counts.labels` and `counts.events`.
  'get-registry-info',
  // Registry tree "Labels: N".
  'get-registry-label-count',
  'get-registry-labels',
  'get-registry-history-timeline',
  // Detach impact: who lives in the registry.
  'get-registry-occupants',
])

/** The registry reads a subname creation or deletion changes. Safe to poll. */
export const invalidateRegistryLabelQueries = (
  queryClient: QueryClient,
): Promise<void> => invalidate(queryClient, LABEL_BACKED_KEYS)
