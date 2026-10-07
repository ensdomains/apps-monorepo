import { QueryClient } from '@tanstack/react-query'
import { ok } from 'neverthrow'
import type { Address } from 'viem'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockClient = { chain: { id: 11155111 } }
vi.mock('@/lib/wagmi/helpers', () => ({
  safeGetClient: () => ok(mockClient),
}))

const mockEnsjsGetNamesForAddress = vi.fn()
vi.mock('@ensdomains/ensjs/subgraph', () => ({
  getNamesForAddress: mockEnsjsGetNamesForAddress,
}))

const mockGraphqlRequest = vi.fn()
vi.mock('@/lib/indexer', () => ({
  graphqlIndexerClient: { request: mockGraphqlRequest },
}))

const { getV1NamesPagesForAddressQueryOptions } = await import(
  './useV1NamesForAddress'
)
const { getV2NamesPagesForAddressQueryOptions } = await import(
  './useV2NamesWithRolesForAddress'
)

const ADDRESS: Address = '0x5B7d523f27c5b2232536Fb900ebFfB590d03ff5D'

describe('getV1NamesPagesForAddressQueryOptions', () => {
  beforeEach(() => {
    mockEnsjsGetNamesForAddress.mockReset()
  })

  const options = getV1NamesPagesForAddressQueryOptions({ address: ADDRESS })
  const v1Name = (i: number) => ({ name: `name${i}.eth` })

  it('pages from the last row of the previous page while pages come back full', async () => {
    const first = Array.from({ length: 100 }, (_, i) => v1Name(i))
    mockEnsjsGetNamesForAddress
      .mockResolvedValueOnce(first)
      .mockResolvedValueOnce([v1Name(100)])

    const data = await new QueryClient().fetchInfiniteQuery({
      ...options,
      pages: 2,
    })

    expect(mockEnsjsGetNamesForAddress.mock.calls[0]?.[1]).toEqual({
      address: ADDRESS,
      previousPage: undefined,
      pageSize: 100,
    })
    expect(mockEnsjsGetNamesForAddress.mock.calls[1]?.[1]).toMatchObject({
      previousPage: [first[99]],
    })
    expect(data.pages.flatMap((page) => page.names)).toHaveLength(101)
    expect(data.pages[1]?.hasNextPage).toBe(false)
  })
})

describe('getV2NamesPagesForAddressQueryOptions', () => {
  beforeEach(() => {
    mockGraphqlRequest.mockReset()
  })

  const options = getV2NamesPagesForAddressQueryOptions({ address: ADDRESS })
  const indexerPage = ({
    names,
    totalCount,
    endCursor,
  }: {
    names: readonly string[]
    totalCount: number
    endCursor: string | null
  }) => ({
    roles: [{ name: names[0], roleBitmap: '0x5' }],
    domainConnection: {
      totalCount,
      pageInfo: { hasNextPage: endCursor !== null, endCursor },
      edges: names.map((name) => ({
        node: { name, expiryDate: 1900000000, subdomainCount: 0 },
      })),
    },
  })

  it('loads the first page with the total and each name’s roles', async () => {
    mockGraphqlRequest.mockResolvedValue(
      indexerPage({
        names: ['a.eth', 'b.eth'],
        totalCount: 29296,
        endCursor: 'c1',
      }),
    )

    const data = await new QueryClient().fetchInfiniteQuery(options)

    expect(mockGraphqlRequest).toHaveBeenCalledWith(expect.anything(), {
      account: ADDRESS.toLowerCase(),
      first: 100,
      after: undefined,
    })
    expect(data.pages[0]?.totalCount).toBe(29296)
    expect(data.pages[0]?.names).toEqual([
      {
        name: 'a.eth',
        expiryDate: 1900000000,
        subdomainCount: 0,
        roleBitmap: '0x5',
      },
      {
        name: 'b.eth',
        expiryDate: 1900000000,
        subdomainCount: 0,
        roleBitmap: '0',
      },
    ])
  })

  it('asks for the next page after the previous page’s cursor', async () => {
    mockGraphqlRequest
      .mockResolvedValueOnce(
        indexerPage({ names: ['a.eth'], totalCount: 2, endCursor: 'c1' }),
      )
      .mockResolvedValueOnce(
        indexerPage({ names: ['b.eth'], totalCount: 2, endCursor: null }),
      )

    const data = await new QueryClient().fetchInfiniteQuery({
      ...options,
      pages: 2,
    })

    expect(mockGraphqlRequest.mock.calls[1]?.[1]).toMatchObject({ after: 'c1' })
    expect(data.pages[1]?.hasNextPage).toBe(false)
  })
})
