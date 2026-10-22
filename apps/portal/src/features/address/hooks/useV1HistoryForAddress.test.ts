import { QueryClient } from '@tanstack/react-query'
import type { Address } from 'viem'
import { namehash } from 'viem/ens'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockGraphqlRequest = vi.fn()
vi.mock('@/lib/indexer', () => ({
  graphqlIndexerClient: { request: mockGraphqlRequest },
}))

const { getV1HistoryForAddressQueryOptions } = await import(
  './useV1HistoryForAddress'
)

const ADDRESS: Address = '0x5B7d523f27c5b2232536Fb900ebFfB590d03ff5D'

describe('getV1HistoryForAddressQueryOptions', () => {
  beforeEach(() => {
    mockGraphqlRequest.mockReset()
  })

  it('reads through the indexer client and keeps events grouped by name', async () => {
    mockGraphqlRequest.mockResolvedValue({
      domains: [
        {
          id: namehash('actual.eth'),
          name: 'reported.eth',
          registrant: { id: ADDRESS },
          wrappedOwner: null,
          events: [{ id: 'event-1', type: 'Transfer' }],
          registration: { events: [{ id: 'event-2', type: 'NameRenewed' }] },
          resolver: { events: [{ id: 'event-3', type: 'TextChanged' }] },
        },
      ],
    })

    const data = await new QueryClient().fetchQuery(
      getV1HistoryForAddressQueryOptions({ address: ADDRESS }),
    )

    expect(mockGraphqlRequest.mock.calls[0]?.[1]).toEqual({
      address: ADDRESS.toLowerCase(),
      first: 1000,
      orderDirection: 'desc',
    })
    expect(data).toEqual([
      {
        name: namehash('reported.eth'),
        registrarHolder: ADDRESS,
        domainEvents: [{ id: 'event-1', type: 'Transfer' }],
        registrationEvents: [{ id: 'event-2', type: 'NameRenewed' }],
        resolverEvents: [{ id: 'event-3', type: 'TextChanged' }],
      },
    ])
  })
})
