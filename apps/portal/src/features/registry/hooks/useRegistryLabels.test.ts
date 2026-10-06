import { QueryClient } from '@tanstack/react-query'
import type { Address } from 'viem'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockGraphqlRequest = vi.fn()
vi.mock('@/lib/indexer', () => ({
  graphqlIndexerClient: { request: mockGraphqlRequest },
}))

const { getRegistryLabelsQueryOptions } = await import('./useRegistryLabels')

const REGISTRY: Address = '0xD4eBcBdF463C9c45784603Db0dDD499BC44A8B4a'

const label = (i: number) => ({
  name: `label${i}.eth`,
  labelName: `label${i}`,
  labelhash: `0x${i.toString(16).padStart(64, '0')}`,
  expiryDate: null,
  roleHoldersCount: 0,
})

const indexerPage = ({
  from,
  count,
  totalCount,
  endCursor,
}: {
  from: number
  count: number
  totalCount: number
  endCursor: string | null
}) => ({
  registry: {
    labelConnection: {
      totalCount,
      pageInfo: { hasNextPage: from + count < totalCount, endCursor },
      edges: Array.from({ length: count }, (_, i) => ({
        node: label(from + i),
      })),
    },
  },
})

describe('getRegistryLabelsQueryOptions', () => {
  beforeEach(() => {
    mockGraphqlRequest.mockReset()
  })

  const options = getRegistryLabelsQueryOptions({ address: REGISTRY })

  it('loads the first page with the registry’s total', async () => {
    mockGraphqlRequest.mockResolvedValue(
      indexerPage({ from: 0, count: 100, totalCount: 10531, endCursor: 'c1' }),
    )

    const data = await new QueryClient().fetchInfiniteQuery(options)

    expect(mockGraphqlRequest).toHaveBeenCalledTimes(1)
    expect(mockGraphqlRequest).toHaveBeenCalledWith(expect.anything(), {
      address: REGISTRY.toLowerCase(),
      first: 100,
      after: undefined,
    })
    expect(data.pages[0]?.labels).toHaveLength(100)
    expect(data.pages[0]?.totalCount).toBe(10531)
  })

  it('asks for the next page after the previous page’s cursor', async () => {
    mockGraphqlRequest
      .mockResolvedValueOnce(
        indexerPage({ from: 0, count: 100, totalCount: 150, endCursor: 'c1' }),
      )
      .mockResolvedValueOnce(
        indexerPage({ from: 100, count: 50, totalCount: 150, endCursor: 'c2' }),
      )

    const data = await new QueryClient().fetchInfiniteQuery({
      ...options,
      pages: 2,
    })

    expect(mockGraphqlRequest.mock.calls[1]?.[1]).toMatchObject({ after: 'c1' })
    expect(data.pages.flatMap((page) => page.labels)).toHaveLength(150)
    expect(data.pages[1]?.hasNextPage).toBe(false)
  })

  it('stops paging when the indexer returns no cursor', () => {
    expect(
      options.getNextPageParam?.(
        { labels: [], totalCount: 500, endCursor: null, hasNextPage: true },
        [],
        undefined,
        [],
      ),
    ).toBeUndefined()
  })

  it('is empty for a registry the indexer does not know', async () => {
    mockGraphqlRequest.mockResolvedValue({ registry: null })

    const data = await new QueryClient().fetchInfiniteQuery(options)

    expect(data.pages[0]).toEqual({
      labels: [],
      totalCount: 0,
      endCursor: null,
      hasNextPage: false,
    })
  })
})
