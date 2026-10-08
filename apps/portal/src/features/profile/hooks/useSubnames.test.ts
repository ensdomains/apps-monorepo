import { QueryClient } from '@tanstack/react-query'
import { ok } from 'neverthrow'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockClient = { chain: { id: 11155111 } }
vi.mock('@/lib/wagmi/helpers', () => ({
  safeGetClient: () => ok(mockClient),
}))

const mockEnsjsGetSubnames = vi.fn()
vi.mock('@ensdomains/ensjs/subgraph', () => ({
  getSubnames: mockEnsjsGetSubnames,
}))

const mockGraphqlRequest = vi.fn()
vi.mock('@/lib/indexer', () => ({
  graphqlIndexerClient: {
    request: mockGraphqlRequest,
  },
}))

const {
  getIsSubnameTakenQueryOptions,
  getSubnamesCountQueryOptions,
  getSubnamesQueryKey,
  getV1Subnames,
  getV2SubnamesQueryOptions,
} = await import('./useSubnames')

describe('getV1Subnames', () => {
  beforeEach(() => {
    mockEnsjsGetSubnames.mockClear()
    mockGraphqlRequest.mockClear()
  })

  it('returns subnames using ensjs for sepolia network', async () => {
    const subname = {
      name: 'sub.test.eth',
      labelName: 'sub',
      labelhash: '0x1234',
      owner: '0x1234567890123456789012345678901234567890',
    }
    mockEnsjsGetSubnames.mockResolvedValue([{ ...subname, wrappedOwner: null }])

    const result = await getV1Subnames({ name: 'test.eth' })

    expect(result._unsafeUnwrap()).toEqual([subname])
    expect(mockEnsjsGetSubnames).toHaveBeenCalledWith(mockClient, {
      name: 'test.eth',
    })
  })

  // The registry slot of a wrapped name belongs to the NameWrapper contract.
  it('reports the wrapper owner, not the NameWrapper, for a wrapped V1 subname', async () => {
    mockEnsjsGetSubnames.mockResolvedValue([
      {
        name: 'sub.test.eth',
        labelName: 'sub',
        labelhash: '0x1234',
        owner: '0x0635513f179D50A207757E05759CbD106d7dFcE8',
        wrappedOwner: '0x1234567890123456789012345678901234567890',
      },
    ])

    const result = await getV1Subnames({ name: 'test.eth' })

    expect(result._unsafeUnwrap()).toEqual([
      {
        name: 'sub.test.eth',
        labelName: 'sub',
        labelhash: '0x1234',
        owner: '0x1234567890123456789012345678901234567890',
      },
    ])
  })

  it('names V1 subnames from their parent, encoding unknown labels', async () => {
    mockEnsjsGetSubnames.mockResolvedValue([
      {
        name: '1.[d9212cee289e4bfe6f6deb963d8b06ce82538df961bf16733c3c34c2f8a057a0].eth',
        labelName: '1',
        labelhash:
          '0xc89efdaa54c0f20c7adf612882df0950f5a951637e0307cdcb4c672f298b8bc6',
        owner: '0x1234567890123456789012345678901234567890',
        wrappedOwner: null,
      },
      {
        name: null,
        labelName: null,
        labelhash:
          '0xad7c5bef027816a800da1736444fb58a807ef4c9603b7848673f7e3a68eb14a5',
        owner: '0x1234567890123456789012345678901234567890',
        wrappedOwner: null,
      },
    ])

    const result = await getV1Subnames({ name: 'phantombug01.eth' })

    expect(result._unsafeUnwrap().map((s) => s.name)).toEqual([
      '1.phantombug01.eth',
      '[ad7c5bef027816a800da1736444fb58a807ef4c9603b7848673f7e3a68eb14a5].phantombug01.eth',
    ])
  })
})

const OWNER_ID = '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd'

const subdomain = (i: number) => ({
  name: `sub${i}.test.eth`,
  labelName: `sub${i}`,
  labelhash: '0xabcd',
  owner: { id: OWNER_ID },
})

/** What the indexer returns for `count` subdomains starting at `from`. */
const indexerPage = (from: number, count: number, subdomainsCount: number) => ({
  domains: [
    {
      subdomainsCount,
      subdomains: Array.from({ length: count }, (_, i) => subdomain(from + i)),
    },
  ],
})

describe('getV2SubnamesQueryOptions', () => {
  beforeEach(() => {
    mockEnsjsGetSubnames.mockReset()
    mockGraphqlRequest.mockReset()
  })

  const options = getV2SubnamesQueryOptions({ name: 'test.eth' })

  // A name can hold thousands of subnames; opening the page must cost one
  // request, whatever the total.
  it('loads only the first page, with the name’s total beside it', async () => {
    mockGraphqlRequest.mockResolvedValue(indexerPage(0, 40, 10181))

    const data = await new QueryClient().fetchInfiniteQuery(options)

    expect(mockGraphqlRequest).toHaveBeenCalledTimes(1)
    expect(mockGraphqlRequest).toHaveBeenCalledWith(expect.anything(), {
      name: 'test.eth',
      skip: 0,
    })
    expect(data.pages).toHaveLength(1)
    expect(data.pages[0]?.subnames).toHaveLength(40)
    expect(data.pages[0]?.totalCount).toBe(10181)
  })

  it('asks for the next page from where the loaded rows end', async () => {
    mockGraphqlRequest
      .mockResolvedValueOnce(indexerPage(0, 40, 51))
      .mockResolvedValueOnce(indexerPage(40, 11, 51))

    const data = await new QueryClient().fetchInfiniteQuery({
      ...options,
      pages: 2,
    })

    expect(
      mockGraphqlRequest.mock.calls.map(([, variables]) => variables),
    ).toEqual([
      { name: 'test.eth', skip: 0 },
      { name: 'test.eth', skip: 40 },
    ])
    const subnames = data.pages.flatMap((page) => page.subnames)
    expect(subnames).toHaveLength(51)
    expect(subnames.at(-1)?.name).toBe('sub50.test.eth')
  })

  it('has no next page once every subname is loaded', async () => {
    mockGraphqlRequest.mockResolvedValue(indexerPage(0, 40, 40))

    const data = await new QueryClient().fetchInfiniteQuery(options)

    expect(
      options.getNextPageParam?.(
        data.pages[0] as never,
        data.pages as never,
        0,
        [0],
      ),
    ).toBeUndefined()
  })

  // A count that ran ahead of the rows must not refetch the same page forever.
  it('stops on an empty page even when the count says there is more', () => {
    const first = {
      subnames: Array.from({ length: 40 }, () => ({})),
      totalCount: 90,
    }
    const empty = { subnames: [], totalCount: 90 }

    expect(
      options.getNextPageParam?.(
        empty as never,
        [first, empty] as never,
        40,
        [0, 40],
      ),
    ).toBeUndefined()
  })

  it('checksums the owner and names rows from their parent, encoding unknown labels', async () => {
    mockGraphqlRequest.mockResolvedValue({
      domains: [
        {
          subdomainsCount: 2,
          subdomains: [
            {
              name: 'sub.[6d255fc3390ee6b41191da315958b7d6a1e5b17904cc7683558f98acc57977b4].eth',
              labelName: 'sub',
              labelhash: '0xabcd',
              owner: { id: OWNER_ID },
            },
            {
              name: null,
              labelName: null,
              labelhash:
                '0xc89efdaa54c0f20c7adf612882df0950f5a951637e0307cdcb4c672f298b8bc6',
              owner: { id: OWNER_ID },
            },
          ],
        },
      ],
    })

    const data = await new QueryClient().fetchInfiniteQuery(options)

    expect(data.pages[0]?.subnames).toEqual([
      {
        name: 'sub.test.eth',
        labelName: 'sub',
        labelhash: '0xabcd',
        owner: '0xABcdEFABcdEFabcdEfAbCdefabcdeFABcDEFabCD',
      },
      {
        name: '[c89efdaa54c0f20c7adf612882df0950f5a951637e0307cdcb4c672f298b8bc6].test.eth',
        labelName: null,
        labelhash:
          '0xc89efdaa54c0f20c7adf612882df0950f5a951637e0307cdcb4c672f298b8bc6',
        owner: '0xABcdEFABcdEFabcdEfAbCdefabcdeFABcDEFabCD',
      },
    ])
  })

  it('is empty, with a zero total, for a name the indexer does not know', async () => {
    mockGraphqlRequest.mockResolvedValue({ domains: [] })

    const data = await new QueryClient().fetchInfiniteQuery(options)

    expect(data.pages[0]).toEqual({ subnames: [], totalCount: 0 })
  })

  // Creating, deleting and transferring a subname all invalidate the name's
  // subnames key; the loaded pages must go stale with it.
  it('is invalidated by the name’s subnames key', async () => {
    mockGraphqlRequest.mockResolvedValue(indexerPage(0, 3, 3))
    const queryClient = new QueryClient()
    await queryClient.fetchInfiniteQuery(options)

    await queryClient.invalidateQueries({
      queryKey: getSubnamesQueryKey({
        name: 'test.eth',
        protocolVersion: 'ENSv2',
      }),
      refetchType: 'none',
    })

    expect(queryClient.getQueryState(options.queryKey)?.isInvalidated).toBe(
      true,
    )
  })
})

describe('getIsSubnameTakenQueryOptions', () => {
  beforeEach(() => {
    mockGraphqlRequest.mockReset()
  })

  it('asks the indexer about the one subname', async () => {
    mockGraphqlRequest.mockResolvedValue({
      domains: [{ name: 'alias.test.eth' }],
    })

    const isTaken = await new QueryClient().fetchQuery(
      getIsSubnameTakenQueryOptions({ name: 'test.eth', label: 'alias' }),
    )

    expect(isTaken).toBe(true)
    expect(mockGraphqlRequest).toHaveBeenCalledTimes(1)
    expect(mockGraphqlRequest).toHaveBeenCalledWith(expect.anything(), {
      name: 'alias.test.eth',
    })
  })

  it('is false when the indexer has no such subname', async () => {
    mockGraphqlRequest.mockResolvedValue({ domains: [] })

    const isTaken = await new QueryClient().fetchQuery(
      getIsSubnameTakenQueryOptions({ name: 'test.eth', label: 'free' }),
    )

    expect(isTaken).toBe(false)
  })
})

describe('getSubnamesCountQueryOptions', () => {
  beforeEach(() => {
    mockEnsjsGetSubnames.mockReset()
    mockGraphqlRequest.mockReset()
  })

  it('reads the V2 count in one request, without listing the subnames', async () => {
    mockGraphqlRequest.mockResolvedValue({
      domains: [{ subdomainsCount: 137 }],
    })

    const count = await new QueryClient().fetchQuery(
      getSubnamesCountQueryOptions({
        name: 'test.eth',
        protocolVersion: 'ENSv2',
      }),
    )

    expect(count).toBe(137)
    expect(mockGraphqlRequest).toHaveBeenCalledTimes(1)
    expect(mockGraphqlRequest).toHaveBeenCalledWith(expect.anything(), {
      name: 'test.eth',
    })
  })

  it('counts the V1 list, which has no count of its own', async () => {
    mockEnsjsGetSubnames.mockResolvedValue([
      { name: 'a.test.eth', labelName: 'a', labelhash: '0x01', owner: '0x1' },
      { name: 'b.test.eth', labelName: 'b', labelhash: '0x02', owner: '0x1' },
    ])

    const count = await new QueryClient().fetchQuery(
      getSubnamesCountQueryOptions({
        name: 'test.eth',
        protocolVersion: 'ENSv1',
      }),
    )

    expect(count).toBe(2)
  })

  // Creating, deleting and transferring a subname all invalidate the list's
  // key; the count must go stale with it.
  it('is invalidated by the list’s query key', async () => {
    mockGraphqlRequest.mockResolvedValue({
      domains: [{ subdomainsCount: 3 }],
    })
    const params = { name: 'test.eth', protocolVersion: 'ENSv2' } as const
    const queryClient = new QueryClient()
    const countOptions = getSubnamesCountQueryOptions(params)
    await queryClient.fetchQuery(countOptions)

    await queryClient.invalidateQueries({
      queryKey: getSubnamesQueryKey(params),
      refetchType: 'none',
    })

    expect(
      queryClient.getQueryState(countOptions.queryKey)?.isInvalidated,
    ).toBe(true)
  })
})
