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

const { getSubnames } = await import('./useSubnames')

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

  it('names a V1 subname from its parent, not the indexer’s stale name', async () => {
    mockEnsjsGetSubnames.mockResolvedValue([
      {
        name: '1.[d9212cee289e4bfe6f6deb963d8b06ce82538df961bf16733c3c34c2f8a057a0].eth',
        labelName: '1',
        labelhash:
          '0xc89efdaa54c0f20c7adf612882df0950f5a951637e0307cdcb4c672f298b8bc6',
        owner: '0x1234567890123456789012345678901234567890',
        wrappedOwner: null,
      },
    ])

    const result = await getSubnames({
      name: 'phantombug01.eth',
      protocolVersion: 'ENSv1',
    })

    expect(result._unsafeUnwrap()[0]?.name).toBe('1.phantombug01.eth')
  })

  it('keeps an unknown subname label encoded under its parent', async () => {
    mockGraphqlRequest.mockResolvedValue({
      domains: [
        {
          subdomains: [
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

    expect(result._unsafeUnwrap()[0]?.name).toBe(
      '[c89efdaa54c0f20c7adf612882df0950f5a951637e0307cdcb4c672f298b8bc6].test.eth',
    )
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
