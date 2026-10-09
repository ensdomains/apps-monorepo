import type { QueryClient } from '@tanstack/react-query'

const resolverQueryKeys = new Set([
  'get-resolver-name',
  'get-resolver',
  'user-permissioned-resolvers',
  'get-name-resolver-address',
  'ensResolver',
  // The name's history feed, which the resolver page renders: a resolver
  // change is a new entry there, and that timeline is how the change is
  // confirmed after the flow redirects to it. Without these, a page visited
  // earlier in the session serves cached history missing the update.
  'get-name-history-pages',
  'get-name-history-anchor',
  // The records page reads whether the name resolves, and the resolver's
  // nodes list and link picker read which names it serves.
  'name-detail',
  'resolver-nodes',
])

/**
 * Invalidates all resolver-related queries so that resolver data refetches
 * after a resolver change (e.g. when navigating back to resolver page).
 */
export function invalidateResolverQueries(
  queryClient: QueryClient,
): Promise<void> {
  return queryClient.invalidateQueries({
    predicate: (query) => resolverQueryKeys.has(query.queryKey[0] as string),
    refetchType: 'all',
  })
}
