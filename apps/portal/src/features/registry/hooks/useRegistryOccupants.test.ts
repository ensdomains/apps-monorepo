import { BignameError } from '@ens-apps/indexer/bigname'
import { QueryClient } from '@tanstack/react-query'
import { ResultAsync } from 'neverthrow'
import type { Address } from 'viem'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const listRegistryLabels = vi.fn()
vi.mock('@/lib/bigname', () => ({
  bigname: {
    registryLabels: (...args: unknown[]) =>
      ResultAsync.fromPromise(listRegistryLabels(...args), (e) => e),
  },
}))

const { getRegistryOccupantsQueryOptions } = await import(
  './useRegistryOccupants'
)

const REGISTRY: Address = '0x1111111111111111111111111111111111111111'
const ACCOUNT: Address = '0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'
const OTHER: Address = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'

const counted = (
  total_count: number | null,
  owners: readonly (Address | undefined)[] = [],
  has_more = false,
) => ({
  data: owners.map((owner, index) => ({ name: `${index}.test.eth`, owner })),
  page: {
    cursor: null,
    next_cursor: has_more ? 'next-page' : null,
    page_size: 200,
    total_count,
    has_more,
  },
  meta: {},
})

const options = () =>
  getRegistryOccupantsQueryOptions({ address: REGISTRY, account: ACCOUNT })

const fetchOccupants = () => new QueryClient().fetchQuery(options())

describe('getRegistryOccupants', () => {
  beforeEach(() => {
    listRegistryLabels.mockReset()
  })

  it('counts a complete small registry in one request, including ownerless labels', async () => {
    listRegistryLabels.mockResolvedValue(
      counted(4, [ACCOUNT, ACCOUNT.toLowerCase() as Address, OTHER, undefined]),
    )

    await expect(fetchOccupants()).resolves.toEqual({
      count: 4,
      thirdPartyCount: 2,
    })
    expect(listRegistryLabels).toHaveBeenCalledExactlyOnceWith(
      expect.any(Number),
      REGISTRY.toLowerCase(),
      { page_size: 200 },
    )
  })

  it('counts an empty registry in one request', async () => {
    listRegistryLabels.mockResolvedValue(counted(0))
    await expect(fetchOccupants()).resolves.toEqual({
      count: 0,
      thirdPartyCount: 0,
    })
    expect(listRegistryLabels).toHaveBeenCalledTimes(1)
  })

  it('counts a full 200-label registry without an unnecessary second read', async () => {
    listRegistryLabels.mockResolvedValue(
      counted(200, [...Array<Address>(199).fill(ACCOUNT), OTHER]),
    )
    await expect(fetchOccupants()).resolves.toEqual({
      count: 200,
      thirdPartyCount: 1,
    })
    expect(listRegistryLabels).toHaveBeenCalledTimes(1)
  })

  it('reads the exact third-party count for a large registry, even when the first page is all caller-owned', async () => {
    listRegistryLabels
      .mockResolvedValueOnce(
        counted(703, Array<Address>(200).fill(ACCOUNT), true),
      )
      .mockResolvedValueOnce(counted(2, [OTHER], true))

    await expect(fetchOccupants()).resolves.toEqual({
      count: 703,
      thirdPartyCount: 2,
    })
    expect(listRegistryLabels).toHaveBeenCalledTimes(2)
    expect(listRegistryLabels).toHaveBeenLastCalledWith(
      expect.any(Number),
      REGISTRY.toLowerCase(),
      { exclude_owner: ACCOUNT.toLowerCase(), page_size: 1 },
    )
  })

  it('does not trust an incomplete page even when its pagination says it is finished', async () => {
    listRegistryLabels
      .mockResolvedValueOnce(counted(2, [ACCOUNT]))
      .mockResolvedValueOnce(counted(1, [OTHER]))
    await expect(fetchOccupants()).resolves.toEqual({
      count: 2,
      thirdPartyCount: 1,
    })
    expect(listRegistryLabels).toHaveBeenCalledTimes(2)
  })

  it('is unknown when bigname declines to count the registry', async () => {
    listRegistryLabels.mockResolvedValue(counted(null, [ACCOUNT], true))
    await expect(fetchOccupants()).resolves.toBeNull()
    expect(listRegistryLabels).toHaveBeenCalledTimes(1)
  })

  it('is unknown when bigname declines to count the third parties', async () => {
    listRegistryLabels
      .mockResolvedValueOnce(counted(703, [ACCOUNT], true))
      .mockResolvedValueOnce(counted(null, [OTHER], true))
    await expect(fetchOccupants()).resolves.toBeNull()
    expect(listRegistryLabels).toHaveBeenCalledTimes(2)
  })

  it('rechecks a cached empty result before a detach instead of deriving counts from stale data', async () => {
    const client = new QueryClient()
    client.setQueryData(options().queryKey, () => ({
      count: 0,
      thirdPartyCount: 0,
    }))
    listRegistryLabels.mockResolvedValue(counted(1, [OTHER]))

    // The destructive-write consumer opts out of the app-wide staleTime.
    await expect(
      client.fetchQuery({ ...options(), staleTime: 0 }),
    ).resolves.toEqual({ count: 1, thirdPartyCount: 1 })
    expect(listRegistryLabels).toHaveBeenCalledTimes(1)
  })

  it('cannot size a registry bigname has not indexed', async () => {
    listRegistryLabels.mockRejectedValue(
      new BignameError({
        status: 404,
        code: 'not_found',
        message: 'registry not found',
      }),
    )
    await expect(fetchOccupants()).resolves.toBeNull()
    expect(listRegistryLabels).toHaveBeenCalledTimes(1)
  })

  it.each([
    1, 2,
  ])('propagates a failure in request %i rather than reporting no third parties', async (request) => {
    const error = new BignameError({
      status: 503,
      code: 'overloaded',
      message: 'unavailable',
    })
    if (request === 2)
      listRegistryLabels.mockResolvedValueOnce(counted(703, [ACCOUNT], true))
    listRegistryLabels.mockRejectedValueOnce(error)

    await expect(fetchOccupants()).rejects.toMatchObject({ cause: error })
  })
})
