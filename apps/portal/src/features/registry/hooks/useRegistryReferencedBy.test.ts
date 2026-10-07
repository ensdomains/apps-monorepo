import { QueryClient } from '@tanstack/react-query'
import type { Address } from 'viem'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockGraphqlRequest = vi.fn()
vi.mock('@/lib/indexer', () => ({
  graphqlIndexerClient: { request: mockGraphqlRequest },
}))

const { getRegistryReferencedByQueryOptions } = await import(
  './useRegistryReferencedBy'
)

const REGISTRY: Address = '0xD4eBcbBDf463C9c45784603DB0dDD499bC44A8B4'

const indexerPage = (
  names: readonly (string | null)[],
  totalCount: number,
  endCursor: string | null,
) => ({
  registry: {
    referencedByConnection: {
      totalCount,
      pageInfo: { hasNextPage: endCursor !== null, endCursor },
      edges: names.map((name) => ({ node: { name } })),
    },
  },
})

describe('getRegistryReferencedByQueryOptions', () => {
  beforeEach(() => {
    mockGraphqlRequest.mockReset()
  })

  const options = getRegistryReferencedByQueryOptions({ address: REGISTRY })

  it('reads the first page with the total', async () => {
    mockGraphqlRequest.mockResolvedValue(indexerPage(['eth', null], 7, 'c1'))

    const data = await new QueryClient().fetchInfiniteQuery(options)

    expect(mockGraphqlRequest).toHaveBeenCalledWith(expect.anything(), {
      address: REGISTRY.toLowerCase(),
      first: 100,
      after: undefined,
    })
    expect(data.pages[0]).toMatchObject({
      names: ['eth', null],
      totalCount: 7,
      hasNextPage: true,
    })
  })

  it('asks for the next page after the previous page’s cursor, until the list ends', async () => {
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

  it('is an empty list for an address the indexer does not know as a registry', async () => {
    mockGraphqlRequest.mockResolvedValue({ registry: null })

    const data = await new QueryClient().fetchInfiniteQuery(options)

    expect(data.pages[0]).toMatchObject({ names: [], totalCount: 0 })
  })
})
