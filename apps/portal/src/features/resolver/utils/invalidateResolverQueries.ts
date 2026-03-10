import type { QueryClient } from '@tanstack/react-query'

/**
 * Invalidates all resolver-related queries so that resolver data refetches
 * after a resolver change (e.g. when navigating back to resolver page).
 */
export function invalidateResolverQueries(
  queryClient: QueryClient,
): Promise<void> {
  return queryClient.invalidateQueries({
    predicate: (query) => {
      const key = query.queryKey[0]
      return (
        key === 'get-resolver-name' ||
        key === 'get-resolver' ||
        key === 'user-dedicated-resolvers' ||
        key === 'get-name-resolver-address' ||
        key === 'ensResolver'
      )
    },
    refetchType: 'all',
  })
}
