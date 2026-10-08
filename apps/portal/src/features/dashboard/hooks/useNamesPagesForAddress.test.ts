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
      orderBy: 'expiryDate',
      orderDirection: 'asc',
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

describe('getV1NamesPagesForAddressQueryOptions with a search', () => {
  beforeEach(() => {
    mockEnsjsGetNamesForAddress.mockReset()
    mockEnsjsGetNamesForAddress.mockResolvedValue([])
  })

  it('asks the subgraph for names containing the text, lowercased', async () => {
    await new QueryClient().fetchInfiniteQuery(
      getV1NamesPagesForAddressQueryOptions({
        address: ADDRESS,
        search: 'CoCo',
      }),
    )

    expect(mockEnsjsGetNamesForAddress.mock.calls[0]?.[1]).toMatchObject({
      filter: { searchString: 'coco', searchType: 'name' },
    })
  })

  it('keeps searches apart from the unfiltered list in the cache', () => {
    const plain = getV1NamesPagesForAddressQueryOptions({ address: ADDRESS })
    const searched = getV1NamesPagesForAddressQueryOptions({
      address: ADDRESS,
      search: 'coco',
    })

    expect(searched.queryKey).not.toEqual(plain.queryKey)
  })
})

describe('getV2NamesPagesForAddressQueryOptions', () => {
  beforeEach(() => {
    mockGraphqlRequest.mockReset()
  })

  const ACCOUNT = ADDRESS.toLowerCase()
  const WITH_EXPIRY = { owner: ACCOUNT, expiry_gt: 0 }
  const WITHOUT_EXPIRY = { owner: ACCOUNT, expiry_lte: 0 }

  const options = getV2NamesPagesForAddressQueryOptions({ address: ADDRESS })
  const indexerPage = ({
    names,
    expiryDate = 1900000000,
    totalCount = names.length,
    restCount = 0,
    endCursor = null,
  }: {
    names: readonly string[]
    expiryDate?: number | null
    totalCount?: number
    restCount?: number
    endCursor?: string | null
  }) => ({
    roles: [{ name: names[0], roleBitmap: '0x5' }],
    page: {
      totalCount,
      pageInfo: { hasNextPage: endCursor !== null, endCursor },
      edges: names.map((name) => ({
        node: { name, expiryDate, subdomainCount: 0 },
      })),
    },
    rest: { totalCount: restCount },
  })

  it('loads expiring names first, with the total and each name’s roles', async () => {
    mockGraphqlRequest.mockResolvedValue(
      indexerPage({
        names: ['a.eth', 'b.eth'],
        totalCount: 28020,
        restCount: 1276,
        endCursor: 'c1',
      }),
    )

    const data = await new QueryClient().fetchInfiniteQuery(options)

    expect(mockGraphqlRequest).toHaveBeenCalledWith(expect.anything(), {
      account: ACCOUNT,
      first: 100,
      after: undefined,
      where: WITH_EXPIRY,
      rest: WITHOUT_EXPIRY,
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
      .mockResolvedValueOnce(indexerPage({ names: ['b.eth'], totalCount: 2 }))

    const data = await new QueryClient().fetchInfiniteQuery({
      ...options,
      pages: 2,
    })

    expect(mockGraphqlRequest.mock.calls[1]?.[1]).toMatchObject({
      after: 'c1',
      where: WITH_EXPIRY,
    })
    expect(data.pages[1]?.nextCursor).toBeUndefined()
    expect(mockGraphqlRequest).toHaveBeenCalledTimes(2)
  })

  it('moves on to names without an expiry once the expiring ones end', async () => {
    mockGraphqlRequest
      .mockResolvedValueOnce(indexerPage({ names: ['a.eth'], restCount: 101 }))
      .mockResolvedValueOnce(
        indexerPage({
          names: ['sub.a.eth'],
          expiryDate: null,
          totalCount: 101,
          restCount: 1,
          endCursor: 'c1',
        }),
      )
      .mockResolvedValueOnce(
        indexerPage({
          names: ['other.a.eth'],
          expiryDate: null,
          totalCount: 101,
          restCount: 1,
        }),
      )

    const data = await new QueryClient().fetchInfiniteQuery({
      ...options,
      pages: 2,
    })

    expect(mockGraphqlRequest.mock.calls[1]?.[1]).toMatchObject({
      after: undefined,
      where: WITHOUT_EXPIRY,
    })
    expect(mockGraphqlRequest.mock.calls[2]?.[1]).toMatchObject({
      after: 'c1',
      where: WITHOUT_EXPIRY,
    })
    expect(
      data.pages.map((page) => page.names.map(({ name }) => name)),
    ).toEqual([['a.eth', 'sub.a.eth'], ['other.a.eth']])
    expect(data.pages.map((page) => page.totalCount)).toEqual([102, 102])
  })

  it('filters both expiry phases by the search text', async () => {
    mockGraphqlRequest.mockResolvedValue(indexerPage({ names: ['coco.eth'] }))

    await new QueryClient().fetchInfiniteQuery(
      getV2NamesPagesForAddressQueryOptions({
        address: ADDRESS,
        search: 'coco',
      }),
    )

    expect(mockGraphqlRequest.mock.calls[0]?.[1]).toMatchObject({
      where: { ...WITH_EXPIRY, name_contains_nocase: 'coco' },
      rest: { ...WITHOUT_EXPIRY, name_contains_nocase: 'coco' },
    })
  })
})
