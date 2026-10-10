/** Registry role reads refresh on confirmation and again after indexing. */
import type { QueryClient } from '@tanstack/react-query'
import { getRegistryRootRoleHoldersQueryKey } from '@/features/roles/hooks/useRegistryRootRoleHolders'
import { registryHistoryTimelineQueryKey } from '../components/v2/RegistryHistory'
import { getRegistryInfoQueryKey } from '../hooks/useRegistry'
import { getRegistryLabelsQueryKey } from '../hooks/useRegistryLabels'
import { getRegistryOccupantsQueryKey } from '../hooks/useRegistryOccupants'
import { getRegistryRoleHistoryForAccountQueryKey } from '../hooks/useRegistryRoleHistoryForAccount'

/** Root role reads from BigName. */
const ROOT_ROLE_KEYS: ReadonlySet<unknown> = new Set([
  // Holders table on /registry/$address/roles.
  getRegistryRootRoleHoldersQueryKey.key,
  // Per-user role-change history embedded in the edit sheet.
  getRegistryRoleHistoryForAccountQueryKey.key,
])

/** Read from bigname: needs polling until it has indexed the transaction. */
const INDEXER_BACKED_KEYS: ReadonlySet<unknown> = new Set([
  // Registry overview (`counts.roles` on RegistryInfo).
  getRegistryInfoQueryKey.key,
  // The registry's own event feed, used by /registry/$address/history.
  registryHistoryTimelineQueryKey.key,
  // Labels table — its `roleHoldersCount` column reads `role_holder_count`.
  getRegistryLabelsQueryKey.key,
])

const invalidate = (
  queryClient: QueryClient,
  keys: ReadonlySet<unknown>,
): Promise<void> =>
  queryClient.invalidateQueries({
    predicate: (query) => keys.has(query.queryKey[0]),
    refetchType: 'all',
  })

/** Everything a role change touches. Call once, on success. */
export const invalidateRegistryQueries = (
  queryClient: QueryClient,
): Promise<void> =>
  invalidate(queryClient, new Set([...ROOT_ROLE_KEYS, ...INDEXER_BACKED_KEYS]))

/** Read from bigname, and changed when a label is created or deleted. */
const LABEL_BACKED_KEYS: ReadonlySet<unknown> = new Set([
  // Overview and registry tree `counts.labels`.
  getRegistryInfoQueryKey.key,
  getRegistryLabelsQueryKey.key,
  registryHistoryTimelineQueryKey.key,
  // Detach impact: who lives in the registry.
  getRegistryOccupantsQueryKey.key,
])

/** The registry reads a subname creation or deletion changes. Safe to poll. */
export const invalidateRegistryLabelQueries = (
  queryClient: QueryClient,
): Promise<void> => invalidate(queryClient, LABEL_BACKED_KEYS)
