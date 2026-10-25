import { useInfiniteQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import type { Address } from 'viem'
import {
  infiniteFetchMore,
  useListLoader,
} from '@/components/ListLoader/useListLoader'
import { queryClient } from '@/utils/queryClient'
import {
  getResolverNodesQueryOptions,
  getResolverOverviewQueryOptions,
  RESOLVER_NODES_PAGE_SIZE,
} from './useResolverOverview'

/** Route loader for the resolver pages: started, not awaited, so they render while the first names load. */
export const prefetchResolverPage = (address: Address) => {
  void queryClient.prefetchInfiniteQuery(
    getResolverNodesQueryOptions({ address }),
  )
  void queryClient.prefetchQuery(getResolverOverviewQueryOptions({ address }))
}

/** The names bound to a resolver, paged in on demand, and the window shown so far. */
export const useResolverNodesList = (address: Address) => {
  const query = useInfiniteQuery(getResolverNodesQueryOptions({ address }))
  const loadedNodes = useMemo(
    () => query.data?.pages.flatMap((page) => page.nodes) ?? [],
    [query.data],
  )
  const loader = useListLoader({
    initialCount: RESOLVER_NODES_PAGE_SIZE,
    loaded: loadedNodes.length,
    total: query.data?.pages[0]?.totalCount ?? undefined,
    hasMore: query.hasNextPage,
    fetchMore: infiniteFetchMore(
      query.fetchNextPage,
      (page) => page.nodes.length,
    ),
    resetKey: address,
  })
  const nodes = useMemo(
    () => loadedNodes.slice(0, loader.shown),
    [loadedNodes, loader.shown],
  )
  return { query, loadedNodes, nodes, loader }
}
