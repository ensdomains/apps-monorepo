import type { QueryClient, QueryKey } from '@tanstack/react-query'
import { type Address, isAddressEqual } from 'viem'
import { CONTRACT_HISTORY_TIMELINE } from '@/features/history/components/ContractHistoryTimeline'

const isHistoryOf = (
  [name, params]: QueryKey,
  resolverAddress: Address,
): boolean =>
  name === CONTRACT_HISTORY_TIMELINE &&
  isAddressEqual(
    (params as { readonly address: Address }).address,
    resolverAddress,
  )

/** Refetches the resolver overviews and this resolver's history after a write to it. */
export const invalidateResolverOverview = (
  queryClient: QueryClient,
  resolverAddress: Address,
) =>
  queryClient.invalidateQueries({
    predicate: ({ queryKey }) =>
      queryKey[0] === 'resolver-overview' ||
      isHistoryOf(queryKey, resolverAddress),
    refetchType: 'all',
  })
