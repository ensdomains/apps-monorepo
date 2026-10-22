import { QueryClient } from '@tanstack/react-query'
import type { Address } from 'viem'
import { namehash } from 'viem/ens'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockGraphqlRequest = vi.fn()
vi.mock('@/lib/indexer', () => ({
  graphqlIndexerClient: { request: mockGraphqlRequest },
}))

const { getResolvedNamesForAddressQueryOptions } = await import(
  './useNamesForResolvedAddress'
)

const ADDRESS: Address = '0x5B7d523f27c5b2232536Fb900ebFfB590d03ff5D'

const domain = (i: number) => ({
  id: namehash(`name${i}.eth`),
  name: `name${i}.eth`,
  resolver: i === 0 ? null : { coinTypes: ['60'] },
})

describe('getResolvedNamesForAddressQueryOptions', () => {
  beforeEach(() => {
    mockGraphqlRequest.mockReset()
  })

  const options = getResolvedNamesForAddressQueryOptions({ address: ADDRESS })

  it('pages after the last id of the previous page while pages come back full', async () => {
    const first = Array.from({ length: 100 }, (_, i) => domain(i))
    mockGraphqlRequest
      .mockResolvedValueOnce({ domains: first })
      .mockResolvedValueOnce({ domains: [domain(100)] })

    const data = await new QueryClient().fetchInfiniteQuery({
      ...options,
      pages: 2,
    })

    expect(mockGraphqlRequest.mock.calls[0]?.[1]).toEqual({
      address: ADDRESS.toLowerCase(),
      first: 100,
      after: '',
    })
    expect(mockGraphqlRequest.mock.calls[1]?.[1]).toMatchObject({
      after: first[99]?.id,
    })
    expect(data.pages.flatMap((page) => page.names)).toHaveLength(101)
    expect(data.pages[1]?.hasNextPage).toBe(false)
  })

  it('lists a name with no resolver without networks', async () => {
    mockGraphqlRequest.mockResolvedValue({ domains: [domain(0), domain(1)] })

    const data = await new QueryClient().fetchInfiniteQuery(options)

    expect(data.pages[0]?.names).toEqual([
      { name: 'name0.eth', coinTypes: [] },
      { name: 'name1.eth', coinTypes: ['60'] },
    ])
  })

  it('does not show a misreported name as the name for another id', async () => {
    mockGraphqlRequest.mockResolvedValue({
      domains: [{ ...domain(0), id: namehash('actual.eth') }],
    })

    const data = await new QueryClient().fetchInfiniteQuery(options)

    expect(data.pages[0]?.names[0]?.name).toBe(namehash('name0.eth'))
  })
})
