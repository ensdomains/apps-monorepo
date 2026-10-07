import type { QueryClient } from '@tanstack/react-query'
import { CONTRACT_HISTORY_TIMELINE } from '@/features/history/components/ContractHistoryTimeline'

const resolverOverviewQueryKeys = new Set<unknown>([
  'resolver-overview',
  CONTRACT_HISTORY_TIMELINE,
])

/** Refetches a resolver's overview and its history after a write to it. */
export const invalidateResolverOverview = (queryClient: QueryClient) =>
  queryClient.invalidateQueries({
    predicate: (query) => resolverOverviewQueryKeys.has(query.queryKey[0]),
    refetchType: 'all',
  })
