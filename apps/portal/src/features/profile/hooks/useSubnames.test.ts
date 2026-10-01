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

const { getSubnames, getSubnamesCountQueryOptions, getSubnamesQueryOptions } =
  await import('./useSubnames')

describe('getSubnames', () => {
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

    const result = await getSubnames({
      name: 'test.eth',
      protocolVersion: 'ENSv1',
    })

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

    const result = await getSubnames({
      name: 'test.eth',
      protocolVersion: 'ENSv1',
    })

    expect(result._unsafeUnwrap()).toEqual([
      {
        name: 'sub.test.eth',
        labelName: 'sub',
        labelhash: '0x1234',
        owner: '0x1234567890123456789012345678901234567890',
      },
    ])
  })

  it('returns subnames using graphql indexer for namechainSepolia', async () => {
    const mockGraphqlResponse = {
      domains: [
        {
          subdomains: [
            {
              name: 'sub.test.eth',
              labelName: 'sub',
              labelhash: '0xabcd',
              owner: { id: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd' },
            },
          ],
        },
      ],
    }
    mockGraphqlRequest.mockResolvedValue(mockGraphqlResponse)

    const result = await getSubnames({
      name: 'test.eth',
      protocolVersion: 'ENSv2',
    })

    expect(result._unsafeUnwrap()).toEqual([
      {
        name: 'sub.test.eth',
        labelName: 'sub',
        labelhash: '0xabcd',
        owner: '0xABcdEFABcdEFabcdEfAbCdefabcdeFABcDEFabCD',
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

    const result = await getSubnames({
      name: 'phantombug01.eth',
      protocolVersion: 'ENSv1',
    })

    expect(result._unsafeUnwrap().map((s) => s.name)).toEqual([
      '1.phantombug01.eth',
      '[ad7c5bef027816a800da1736444fb58a807ef4c9603b7848673f7e3a68eb14a5].phantombug01.eth',
    ])
  })

  it('names V2 subnames from their parent, encoding unknown labels', async () => {
    mockGraphqlRequest.mockResolvedValue({
      domains: [
        {
          subdomains: [
            {
              name: 'sub.[6d255fc3390ee6b41191da315958b7d6a1e5b17904cc7683558f98acc57977b4].eth',
              labelName: 'sub',
              labelhash: '0xabcd',
              owner: { id: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd' },
            },
            {
              name: null,
              labelName: null,
              labelhash:
                '0xc89efdaa54c0f20c7adf612882df0950f5a951637e0307cdcb4c672f298b8bc6',
              owner: { id: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd' },
            },
          ],
        },
      ],
    })

    const result = await getSubnames({
      name: 'test.eth',
      protocolVersion: 'ENSv2',
    })

    expect(result._unsafeUnwrap().map((s) => s.name)).toEqual([
      'sub.test.eth',
      '[c89efdaa54c0f20c7adf612882df0950f5a951637e0307cdcb4c672f298b8bc6].test.eth',
    ])
  })

  it('pages through every V2 subname, not just the first page', async () => {
    const subdomain = (i: number) => ({
      name: `sub${i}.test.eth`,
      labelName: `sub${i}`,
      labelhash: '0xabcd',
      owner: { id: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd' },
    })
    mockGraphqlRequest
      .mockResolvedValueOnce({
        domains: [
          { subdomains: Array.from({ length: 40 }, (_, i) => subdomain(i)) },
        ],
      })
      .mockResolvedValueOnce({
        domains: [
          {
            subdomains: Array.from({ length: 11 }, (_, i) => subdomain(40 + i)),
          },
        ],
      })

    const result = await getSubnames({
      name: 'test.eth',
      protocolVersion: 'ENSv2',
    })

    const subnames = result._unsafeUnwrap()
    expect(subnames).toHaveLength(51)
    expect(subnames.at(-1)?.name).toBe('sub50.test.eth')
    expect(
      mockGraphqlRequest.mock.calls.map(([, variables]) => variables),
    ).toEqual([
      { name: 'test.eth', skip: 0 },
      { name: 'test.eth', skip: 40 },
    ])
  })

  it('returns empty array when domain has no subdomains', async () => {
    const mockGraphqlResponse = {
      domains: [{ subdomains: [] }],
    }
    mockGraphqlRequest.mockResolvedValue(mockGraphqlResponse)

    const result = await getSubnames({
      name: 'empty.eth',
      protocolVersion: 'ENSv2',
    })

    expect(result._unsafeUnwrap()).toEqual([])
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
      queryKey: getSubnamesQueryOptions(params).queryKey,
      refetchType: 'none',
    })

    expect(
      queryClient.getQueryState(countOptions.queryKey)?.isInvalidated,
    ).toBe(true)
  })
})
