import { errAsync, okAsync } from 'neverthrow'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  client: {},
  getV1Expiry: vi.fn(),
  getV2Expiry: vi.fn(),
  getNameDetail: vi.fn(),
  owner: null as null | { readonly owner?: string; readonly protocol: string },
}))

vi.mock('./profileOwner', async () => {
  const { ok } = await import('neverthrow')
  return { getOwner: () => ok(mocks.owner) }
})

vi.mock('@/features/shared/service/nameDetail', () => ({
  getNameDetail: mocks.getNameDetail,
}))

vi.mock('@ensdomains/ensjs/public/v1', () => ({
  getExpiry: mocks.getV1Expiry,
}))

vi.mock('@ensdomains/ensjs/public/v2', () => ({
  getExpiry: mocks.getV2Expiry,
}))

vi.mock('@/lib/wagmi/helpers', async () => {
  const { ok } = await import('neverthrow')
  return {
    safeGetClient: () => ok(mocks.client),
  }
})

import {
  getExpiry,
  getProfileExpiryResultStatus,
  profileExpiryQuery,
} from './profileExpiry'

describe('profileExpiryQuery', () => {
  it('includes protocol in the query key', () => {
    expect(profileExpiryQuery('foo.eth', 'v1').queryKey).toEqual([
      {
        $scope: 'profile',
        $action: 'expiry',
        name: 'foo.eth',
        protocol: 'v1',
      },
    ])
  })
})

describe('getExpiry', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getV2Expiry.mockResolvedValue(0n)
    mocks.owner = null
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('uses V1 registrar expiry for a V1 name', async () => {
    mocks.getV1Expiry.mockResolvedValue({
      expiry: 1_793_442_936n,
      gracePeriod: 7_776_000,
      status: 'active',
    })

    const result = await getExpiry('fgeorgescu.eth', 'v1')

    expect(result.isOk()).toBe(true)
    expect(result._unsafeUnwrap()).toEqual({
      expiry: 1_793_442_936n,
      isNonExpiring: false,
      protocol: 'v1',
    })
    expect(mocks.getV1Expiry).toHaveBeenCalledWith(mocks.client, {
      name: 'fgeorgescu.eth',
    })
  })

  it('does not query V2 registration or expiry for a V1 name', async () => {
    mocks.getV2Expiry.mockResolvedValue(1_801_218_936n)
    mocks.getV1Expiry.mockResolvedValue({
      expiry: 1_793_442_936n,
      gracePeriod: 7_776_000,
      status: 'active',
    })

    const result = await getExpiry('fgeorgescu.eth', 'v1')

    expect(result.isOk()).toBe(true)
    expect(result._unsafeUnwrap()).toEqual({
      expiry: 1_793_442_936n,
      isNonExpiring: false,
      protocol: 'v1',
    })
    expect(mocks.getV2Expiry).not.toHaveBeenCalled()
    expect(mocks.getV1Expiry).toHaveBeenCalledWith(mocks.client, {
      name: 'fgeorgescu.eth',
    })
  })

  it('uses V2 expiry for a V2 name', async () => {
    mocks.getV2Expiry.mockResolvedValue(1_801_218_936n)

    const result = await getExpiry('fgeorgescu.eth', 'v2')

    expect(result.isOk()).toBe(true)
    expect(result._unsafeUnwrap()).toEqual({
      expiry: 1_801_218_936n,
      isNonExpiring: false,
      protocol: 'v2',
    })
    expect(mocks.getV1Expiry).not.toHaveBeenCalled()
  })

  it('preserves non-expiring V1 fallback state', async () => {
    mocks.getV1Expiry.mockResolvedValue({
      expiry: 0n,
      gracePeriod: 7_776_000,
      status: 'active',
    })

    const result = await getExpiry('pokemon.eth', 'v1')

    expect(result.isOk()).toBe(true)
    expect(result._unsafeUnwrap()).toEqual({
      expiry: null,
      isNonExpiring: true,
      protocol: 'v1',
    })
  })

  it('does not read an unowned V2 label as non-expiring', async () => {
    // The registry reads 0 for a label it holds no record of, which is what an
    // unregistered name returns; calling that non-expiring made the renewal
    // route report a name it could not yet see as permanently unrenewable.
    mocks.getV2Expiry.mockResolvedValue(0n)
    mocks.owner = null

    const result = await getExpiry('android17.eth')

    expect(result._unsafeUnwrap()).toEqual({
      expiry: null,
      isNonExpiring: false,
      protocol: 'v2',
    })
  })

  it('reads an owned V2 label with no expiry as non-expiring', async () => {
    mocks.getV2Expiry.mockResolvedValue(0n)
    mocks.owner = {
      owner: '0x1111111111111111111111111111111111111111',
      protocol: 'v2',
    }

    const result = await getExpiry('permanent.eth')

    expect(result._unsafeUnwrap()).toEqual({
      expiry: null,
      isNonExpiring: true,
      protocol: 'v2',
    })
  })

  it('uses V1 grace rules for V1 fallback expiry results', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2024-02-15T00:00:00Z'))

    const status = getProfileExpiryResultStatus({
      expiry: BigInt(
        Math.floor(new Date('2024-01-01T00:00:00Z').getTime() / 1000),
      ),
      isNonExpiring: false,
      protocol: 'v1',
    })

    expect(status.isInGrace).toBe(true)
  })
})

describe('subnames', () => {
  // Not clamped to the parent: a v2 label carries its own expiry in its
  // registry, and a detached or custom subregistry can outlive its parent.
  it('reads the expiry the indexer records for the subname itself', async () => {
    mocks.getNameDetail.mockReturnValue(
      okAsync({ expiresAt: new Date(1_821_700_419 * 1000) }),
    )

    const result = await getExpiry('mini.shiba.eth')

    expect(result._unsafeUnwrap()).toEqual({
      expiry: 1_821_700_419n,
      isNonExpiring: false,
      protocol: 'v2',
      isSubname: true,
    })
    expect(mocks.getV2Expiry).not.toHaveBeenCalled()
  })

  it('reports no expiry for a subname the indexer does not know', async () => {
    mocks.getNameDetail.mockReturnValue(okAsync(null))

    const result = await getExpiry('mini.shiba.eth')

    expect(result._unsafeUnwrap().expiry).toBeNull()
  })

  it('reports no expiry when the index cannot be read', async () => {
    mocks.getNameDetail.mockReturnValue(errAsync(new Error('bigname down')))

    const result = await getExpiry('mini.shiba.eth')

    expect(result._unsafeUnwrap().expiry).toBeNull()
  })

  it('reports no grace window after a subname expires', async () => {
    mocks.getNameDetail.mockReturnValue(
      okAsync({ expiresAt: new Date(1_600_000_000 * 1000) }),
    )

    const status = getProfileExpiryResultStatus(
      (await getExpiry('mini.shiba.eth'))._unsafeUnwrap(),
    )

    expect(status.isInGrace).toBe(false)
    expect(status.graceEndDate).toBeNull()
    expect(status.isPastGrace).toBe(true)
    expect(status.displayExpiryDate).toEqual(new Date(1_600_000_000 * 1000))
  })
})
