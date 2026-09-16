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
