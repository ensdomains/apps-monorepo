import { QueryClient } from '@tanstack/react-query'
import { describe, expect, it } from 'vitest'
import {
  getNameHistoryAnchorQueryKey,
  getNameHistoryPagesQueryKey,
} from '@/features/history/hooks/useNameHistoryTimeline'
import { nameDetailQueryKey } from '@/features/profile/hooks/useNameDetail'
import { getNameResolverAddressQueryKey } from '@/features/records/hooks/useNameResolverAddress'
import { resolverNodesQueryKey } from '../hooks/useResolverOverview'
import { userPermissionedResolversQueryKey } from '../hooks/useUserPermissionedResolvers'
import { invalidateResolverQueries } from './invalidateResolverQueries'

const seed = (queryClient: QueryClient, queryKey: readonly unknown[]) =>
  queryClient.setQueryData(queryKey, 'cached')

const isStale = (queryClient: QueryClient, queryKey: readonly unknown[]) =>
  queryClient.getQueryState(queryKey)?.isInvalidated === true

describe('invalidateResolverQueries', () => {
  // Keyed through the factories the reads use, so a renamed key fails here.
  it.each([
    getNameResolverAddressQueryKey.key,
    userPermissionedResolversQueryKey.key,
    getNameHistoryPagesQueryKey.key,
    getNameHistoryAnchorQueryKey.key,
    nameDetailQueryKey.key,
    resolverNodesQueryKey.key,
    'ensResolver',
  ])('invalidates %s', async (key) => {
    const queryClient = new QueryClient()
    seed(queryClient, [key, { name: 'alice.eth' }])

    await invalidateResolverQueries(queryClient)

    expect(isStale(queryClient, [key, { name: 'alice.eth' }])).toBe(true)
  })

  it('leaves unrelated queries alone', async () => {
    const queryClient = new QueryClient()
    seed(queryClient, ['get-ens-owner', { name: 'alice.eth' }])

    await invalidateResolverQueries(queryClient)

    expect(isStale(queryClient, ['get-ens-owner', { name: 'alice.eth' }])).toBe(
      false,
    )
  })
})
