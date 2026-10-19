import type { QueryClient } from '@tanstack/react-query'
import {
  getNameHistoryAnchorQueryKey,
  getNameHistoryPagesQueryKey,
} from '@/features/history/hooks/useNameHistoryTimeline'
import { nameDetailQueryKey } from '@/features/profile/hooks/useNameDetail'
import { getNameResolverAddressQueryKey } from '@/features/records/hooks/useNameResolverAddress'
import { resolverNodesQueryKey } from '../hooks/useResolverOverview'
import { userPermissionedResolversQueryKey } from '../hooks/useUserPermissionedResolvers'

const resolverQueryKeys: ReadonlySet<unknown> = new Set([
  userPermissionedResolversQueryKey.key,
  getNameResolverAddressQueryKey.key,
  // wagmi's own key for `useEnsResolver`.
  'ensResolver',
  // The name's history feed, which the resolver page renders: a resolver
  // change is a new entry there, and that timeline is how the change is
  // confirmed after the flow redirects to it. Without these, a page visited
  // earlier in the session serves cached history missing the update.
  getNameHistoryPagesQueryKey.key,
  getNameHistoryAnchorQueryKey.key,
  // The records page reads whether the name resolves, and the resolver's
  // nodes list and link picker read which names it serves.
  nameDetailQueryKey.key,
  resolverNodesQueryKey.key,
])

/**
 * Invalidates all resolver-related queries so that resolver data refetches
 * after a resolver change (e.g. when navigating back to resolver page).
 */
export function invalidateResolverQueries(
  queryClient: QueryClient,
): Promise<void> {
  return queryClient.invalidateQueries({
    predicate: (query) => resolverQueryKeys.has(query.queryKey[0]),
    refetchType: 'all',
  })
}
