import { QueryClient } from '@tanstack/react-query'
import type { Address } from 'viem'
import { describe, expect, it } from 'vitest'
import {
  getNameHistoryAnchorQueryOptions,
  getNameHistoryPagesQueryOptions,
} from '@/features/history/hooks/useNameHistoryTimeline'
import { getNameDetailQueryOptions } from '@/features/profile/hooks/useNameDetail'
import { getNameResolverAddressQueryOptions } from '@/features/records/hooks/useNameResolverAddress'
import { getResolverNodesQueryOptions } from '../hooks/useResolverOverview'
import { userPermissionedResolversQueryKey } from '../hooks/useUserPermissionedResolvers'
import { invalidateResolverQueries } from './invalidateResolverQueries'

const NAME = 'alice.eth'
const ADDRESS: Address = '0x1111111111111111111111111111111111111111'

const seed = (queryClient: QueryClient, queryKey: readonly unknown[]) =>
  queryClient.setQueryData(queryKey, 'cached')

const isStale = (queryClient: QueryClient, queryKey: readonly unknown[]) =>
  queryClient.getQueryState(queryKey)?.isInvalidated === true

describe('invalidateResolverQueries', () => {
  // Keys from the options the reads use, so a key renamed on one side fails here.
  it.each([
    [
      'name resolver',
      getNameResolverAddressQueryOptions({ name: NAME }).queryKey,
    ],
    // The hook builds its options inline around this key.
    [
      'permissioned resolvers',
      userPermissionedResolversQueryKey({ senderAddress: ADDRESS }),
    ],
    ['history pages', getNameHistoryPagesQueryOptions({ name: NAME }).queryKey],
    [
      'history anchor',
      getNameHistoryAnchorQueryOptions({ name: NAME }).queryKey,
    ],
    ['name detail', getNameDetailQueryOptions({ name: NAME }).queryKey],
    [
      'resolver nodes',
      getResolverNodesQueryOptions({ address: ADDRESS }).queryKey,
    ],
    // wagmi's own key for `useEnsResolver`.
    ['wagmi resolver', ['ensResolver', { name: NAME }]],
  ] as const)('invalidates %s', async (_, queryKey) => {
    const queryClient = new QueryClient()
    seed(queryClient, queryKey)

    await invalidateResolverQueries(queryClient)

    expect(isStale(queryClient, queryKey)).toBe(true)
  })

  it('leaves unrelated queries alone', async () => {
    const queryClient = new QueryClient()
    seed(queryClient, ['get-ens-owner', { name: NAME }])

    await invalidateResolverQueries(queryClient)

    expect(isStale(queryClient, ['get-ens-owner', { name: NAME }])).toBe(false)
  })
})
