import { BignameError } from '@ens-apps/bigname'
import { QueryClient } from '@tanstack/react-query'
import type { Address } from 'viem'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const listRegistryLabels = vi.fn()
vi.mock('@/lib/bigname', () => ({ bigname: { listRegistryLabels } }))

const { getRegistryOccupantsQueryOptions } = await import(
  './useRegistryOccupants'
)

const REGISTRY: Address = '0x1111111111111111111111111111111111111111'
const ACCOUNT: Address = '0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'

const counted = (total_count: number | null) => ({
  data: [],
  page: {
    cursor: null,
    next_cursor: null,
    page_size: 1,
    total_count,
    has_more: false,
  },
  meta: {},
})

const fetchOccupants = () =>
  new QueryClient().fetchQuery(
    getRegistryOccupantsQueryOptions({ address: REGISTRY, account: ACCOUNT }),
  )

describe('getRegistryOccupants', () => {
  beforeEach(() => {
    listRegistryLabels.mockReset()
  })

  it('reads both counts from bigname, the third parties via exclude_owner', async () => {
    listRegistryLabels.mockImplementation(
      async (_chain: number, _registry: string, query: object) =>
        counted('exclude_owner' in query ? 2 : 703),
    )

    await expect(fetchOccupants()).resolves.toEqual({
      count: 703,
      thirdPartyCount: 2,
    })
    expect(listRegistryLabels).toHaveBeenCalledWith(
      expect.any(Number),
      REGISTRY.toLowerCase(),
      { exclude_owner: ACCOUNT.toLowerCase(), page_size: 1 },
    )
  })

  it('is unknown when bigname declines to count', async () => {
    listRegistryLabels.mockResolvedValue(counted(null))
    await expect(fetchOccupants()).resolves.toBeNull()
  })

  it('has no occupants in a registry bigname has not indexed', async () => {
    listRegistryLabels.mockRejectedValue(
      new BignameError({
        status: 404,
        code: 'not_found',
        message: 'registry not found',
        url: '/v1/registries/x/labels',
      }),
    )
    await expect(fetchOccupants()).resolves.toEqual({
      count: 0,
      thirdPartyCount: 0,
    })
  })
})
