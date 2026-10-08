import { QueryClient } from '@tanstack/react-query'
import type { Address } from 'viem'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockGraphqlRequest = vi.fn()
vi.mock('@/lib/indexer', () => ({
  graphqlIndexerClient: { request: mockGraphqlRequest },
}))

const { getResolverNodesQueryOptions } = await import('./useResolverNodes')

const RESOLVER: Address = '0x0C9f5E9ae61165140B49919f0dF13C0A6642e80d'

const indexerPage = (
  names: readonly string[],
  totalCount: number,
  endCursor: string | null,
) => ({
  domainConnection: {
    totalCount,
    pageInfo: { hasNextPage: endCursor !== null, endCursor },
    edges: names.map((name) => ({
      node: { id: `id-${name}`, name, owner: null, resolver: null },
    })),
  },
})

describe('getResolverNodesQueryOptions', () => {
  beforeEach(() => {
    mockGraphqlRequest.mockReset()
  })

  const options = getResolverNodesQueryOptions({ address: RESOLVER })

  it('reads the first page of names resolving through the resolver, with the total', async () => {
    mockGraphqlRequest.mockResolvedValue(indexerPage(['a.eth'], 1276, 'c1'))

    const data = await new QueryClient().fetchInfiniteQuery(options)

    expect(mockGraphqlRequest).toHaveBeenCalledWith(expect.anything(), {
      resolver: RESOLVER.toLowerCase(),
      first: 100,
      after: undefined,
    })
    expect(data.pages[0]?.totalCount).toBe(1276)
    expect(data.pages[0]?.nodes.map(({ name }) => name)).toEqual(['a.eth'])
  })

  it('asks for the next page after the previous page’s cursor, until the feed ends', async () => {
    mockGraphqlRequest
      .mockResolvedValueOnce(indexerPage(['a.eth'], 2, 'c1'))
      .mockResolvedValueOnce(indexerPage(['b.eth'], 2, null))

    const data = await new QueryClient().fetchInfiniteQuery({
      ...options,
      pages: 2,
    })

    expect(mockGraphqlRequest.mock.calls[1]?.[1]).toMatchObject({ after: 'c1' })
    expect(data.pages[1]?.hasNextPage).toBe(false)
  })
})
