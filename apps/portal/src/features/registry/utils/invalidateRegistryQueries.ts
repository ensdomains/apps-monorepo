/** Registry role reads refresh on confirmation and again after indexing. */
import type { QueryClient } from '@tanstack/react-query'

/** Root role reads from BigName. */
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
export const invalidateIndexedRegistryQueries = invalidateRegistryQueries

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
