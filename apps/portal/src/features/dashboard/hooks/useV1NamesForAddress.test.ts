import { QueryClient } from '@tanstack/react-query'
import { ok } from 'neverthrow'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockClient = { chain: { id: 11155111 } }
vi.mock('@/lib/wagmi/helpers', () => ({
  safeGetClient: () => ok(mockClient),
}))

const mockEnsjsGetNamesForAddress = vi.fn()
vi.mock('@ensdomains/ensjs/subgraph', () => ({
  getNamesForAddress: mockEnsjsGetNamesForAddress,
}))

const { getV1NamesPagesForAddressQueryOptions } = await import(
  './useV1NamesForAddress'
)

const VIEWER = '0x1234567890123456789012345678901234567890'

const OWNERSHIP_FILTER = {
  owner: true,
  registrant: true,
  wrappedOwner: true,
  resolvedAddress: false,
}

const fetchNames = async (search?: string) => {
  const data = await new QueryClient().fetchInfiniteQuery(
    getV1NamesPagesForAddressQueryOptions({ address: VIEWER, search }),
  )
  return data.pages.flatMap((page) => page.names)
}

describe('getV1NamesPagesForAddressQueryOptions', () => {
  beforeEach(() => {
    mockEnsjsGetNamesForAddress.mockReset()
    mockEnsjsGetNamesForAddress.mockResolvedValue([])
  })

  it('asks the subgraph for owned names only, not names resolving to the address', async () => {
    await fetchNames()

    expect(mockEnsjsGetNamesForAddress).toHaveBeenCalledWith(
      mockClient,
      expect.objectContaining({ address: VIEWER, filter: OWNERSHIP_FILTER }),
    )
  })

  it('keeps to owned names when searching', async () => {
    await fetchNames('coco')

    expect(mockEnsjsGetNamesForAddress).toHaveBeenCalledWith(
      mockClient,
      expect.objectContaining({
        filter: {
          ...OWNERSHIP_FILTER,
          searchString: 'coco',
          searchType: 'name',
        },
      }),
    )
  })

  it('drops a name whose addr record is the address but whose registrant is someone else', async () => {
    mockEnsjsGetNamesForAddress.mockResolvedValue([
      {
        name: 'mine.eth',
        relation: { owner: true, registrant: true, resolvedAddress: false },
      },
      {
        name: 'pointed-at-me.eth',
        relation: { owner: false, registrant: false, resolvedAddress: true },
      },
    ])

    const names = await fetchNames()

    expect(names.map(({ name }) => name)).toEqual(['mine.eth'])
  })

  it('keeps names held through any ownership relation', async () => {
    mockEnsjsGetNamesForAddress.mockResolvedValue([
      { name: 'registrant.eth', relation: { registrant: true } },
      { name: 'manager.eth', relation: { owner: true } },
      { name: 'wrapped.eth', relation: { wrappedOwner: true } },
    ])

    const names = await fetchNames()

    expect(names.map(({ name }) => name)).toEqual([
      'registrant.eth',
      'manager.eth',
      'wrapped.eth',
    ])
  })
})
