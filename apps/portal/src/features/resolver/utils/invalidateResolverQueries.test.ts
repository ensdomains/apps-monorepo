import { QueryClient } from '@tanstack/react-query'
import { describe, expect, it } from 'vitest'
import { invalidateResolverQueries } from './invalidateResolverQueries'

const seed = (queryClient: QueryClient, queryKey: readonly unknown[]) =>
  queryClient.setQueryData(queryKey, 'cached')

const isStale = (queryClient: QueryClient, queryKey: readonly unknown[]) =>
  queryClient.getQueryState(queryKey)?.isInvalidated === true

describe('invalidateResolverQueries', () => {
  it('invalidates the resolver lookups the pages read', async () => {
    const queryClient = new QueryClient()
    seed(queryClient, ['get-name-resolver-address', { name: 'alice.eth' }])
    seed(queryClient, ['ensResolver', { name: 'alice.eth' }])

    await invalidateResolverQueries(queryClient)

    expect(
      isStale(queryClient, [
        'get-name-resolver-address',
        { name: 'alice.eth' },
      ]),
    ).toBe(true)
    expect(isStale(queryClient, ['ensResolver', { name: 'alice.eth' }])).toBe(
      true,
    )
  })

  // The change-resolver flow redirects to the resolver page, where the history
  // timeline is what confirms the change. Cached history from an earlier visit
  // would otherwise show no sign of it.
  it.each([
    'get-name-history-pages',
    'get-name-history-anchor',
  ])('invalidates the name history feed (%s)', async (key) => {
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
