import type { QueryClient, QueryKey } from '@tanstack/react-query'
import { type Address, isAddress, isAddressEqual } from 'viem'
import { CONTRACT_HISTORY_TIMELINE } from '@/features/history/components/ContractHistoryTimeline'
import { RESOLVER_ROLES_FOR_ACCOUNT } from '../hooks/useResolverCallerAdminRoles'
import { RESOLVER_NODES } from '../hooks/useResolverNodes'

const RESOLVER_SCOPED_QUERIES = new Set<unknown>([
  CONTRACT_HISTORY_TIMELINE,
  RESOLVER_NODES,
  RESOLVER_ROLES_FOR_ACCOUNT,
])

const isResolver = (value: unknown, resolverAddress: Address): boolean =>
  typeof value === 'string' &&
  isAddress(value) &&
  isAddressEqual(value, resolverAddress)

const isScopedTo = (
  [name, params]: QueryKey,
  resolverAddress: Address,
): boolean => {
  if (typeof params !== 'object' || params === null) return false
  if (RESOLVER_SCOPED_QUERIES.has(name))
    return 'address' in params && isResolver(params.address, resolverAddress)
  return (
    name === 'hasRoles' &&
    'resolverAddress' in params &&
    isResolver(params.resolverAddress, resolverAddress)
  )
}

/** Refetches the resolver overviews and this resolver's history, nodes and role reads after a write to it. */
export const invalidateResolverOverview = (
  queryClient: QueryClient,
  resolverAddress: Address,
) =>
  queryClient.invalidateQueries({
    predicate: ({ queryKey }) =>
      queryKey[0] === 'resolver-overview' ||
      isScopedTo(queryKey, resolverAddress),
    refetchType: 'all',
  })
