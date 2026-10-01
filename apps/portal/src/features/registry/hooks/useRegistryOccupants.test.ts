import { QueryClient } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockGraphqlRequest = vi.fn()
vi.mock('@/lib/indexer', () => ({
  graphqlIndexerClient: {
    request: mockGraphqlRequest,
  },
}))

const { getRegistryOccupantsQueryOptions } = await import(
  './useRegistryOccupants'
)

const REGISTRY = '0x6fdec1496fe8ff0c07b815d72a53a014d6072ff6'
const OWNER = '0xB8194BD8F2f76bBd18aA762D376fAD31d01303Da'

const fetchOccupants = (name = 'gomigo.eth') =>
  new QueryClient({
    defaultOptions: { queries: { retry: false } },
  }).fetchQuery(
    getRegistryOccupantsQueryOptions({
      address: REGISTRY,
      name,
      account: OWNER,
    }),
  )

describe('getRegistryOccupants', () => {
  beforeEach(() => {
    mockGraphqlRequest.mockReset()
  })

  // gomigo.eth and gomipass.eth share one 17-label registry, which the indexer
  // keeps as 34 domains — one per label per parent.
  it('counts only the name’s own subnames when the registry is shared', async () => {
    mockGraphqlRequest.mockResolvedValue({
      registry: { labelCount: 17 },
      domains: [{ subdomainsCount: 17 }],
      total: { totalCount: 34 },
      own: { totalCount: 34 },
    })

    await expect(fetchOccupants()).resolves.toEqual({
      count: 17,
      thirdPartyCount: 0,
    })
    expect(mockGraphqlRequest).toHaveBeenCalledWith(expect.anything(), {
      registry: REGISTRY,
      name: 'gomigo.eth',
      account: OWNER.toLowerCase(),
    })
  })

  it('reports third parties from the registry-wide counts', async () => {
    mockGraphqlRequest.mockResolvedValue({
      registry: { labelCount: 5 },
      domains: [{ subdomainsCount: 5 }],
      total: { totalCount: 10 },
      own: { totalCount: 8 },
    })

    await expect(fetchOccupants()).resolves.toEqual({
      count: 5,
      thirdPartyCount: 2,
    })
  })

  it('returns null when the indexer has no record of the name', async () => {
    mockGraphqlRequest.mockResolvedValue({
      registry: { labelCount: 17 },
      domains: [],
      total: { totalCount: 34 },
      own: { totalCount: 34 },
    })

    await expect(fetchOccupants()).resolves.toBeNull()
  })

  it('looks the name up under its normalized spelling', async () => {
    mockGraphqlRequest.mockResolvedValue({
      registry: { labelCount: 17 },
      domains: [{ subdomainsCount: 17 }],
      total: { totalCount: 34 },
      own: { totalCount: 34 },
    })

    await fetchOccupants('GomiGo.eth')

    expect(mockGraphqlRequest).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ name: 'gomigo.eth' }),
    )
  })

  it('fails without querying for a name that cannot be normalized', async () => {
    await expect(fetchOccupants('gomi go.eth')).rejects.toMatchObject({
      _tag: 'RegistryNameNotNormalizableError',
    })
    expect(mockGraphqlRequest).not.toHaveBeenCalled()
  })
})
