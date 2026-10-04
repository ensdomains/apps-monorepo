import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  client: {},
  getV2Expiry: vi.fn(),
  getName: vi.fn(),
  owner: null as null | { readonly owner?: string; readonly protocol: string },
}))

vi.mock('./profileOwner', async () => {
  const { ok } = await import('neverthrow')
  return { getOwner: () => ok(mocks.owner) }
})

vi.mock('@/lib/bigname', () => ({ bigname: { getName: mocks.getName } }))

const subnameDetail = (expiresAt?: string | null) => ({
  data: {
    name: 'mini.shiba.eth',
    status: 'ok',
    expires_at: expiresAt,
    ...(expiresAt === null ? { expires_at_reason: 'not_set' } : {}),
  },
  meta: {},
})

/** bigname v0.4.1 name detail of an ENSv1 `.eth` 2LD after the cutover. */
const v1Detail = (lease: string | null, reservation = '1798801736') => ({
  data: {
    name: 'fgeorgescu.eth',
    status: 'ok',
    authority: 'ens_v1',
    expires_at: reservation,
    ens_v1: { expires_at: lease },
  },
  meta: {},
})

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

  it("reads a V1 name's lease from bigname ens_v1.expires_at, not the ENSv2 reservation", async () => {
    mocks.getName.mockResolvedValue(v1Detail('1793442936'))

    const result = await getExpiry('fgeorgescu.eth', 'v1')

    expect(result._unsafeUnwrap()).toEqual({
      expiry: 1_793_442_936n,
      isNonExpiring: false,
      protocol: 'v1',
    })
    expect(mocks.getName).toHaveBeenCalledWith('fgeorgescu.eth')
    expect(mocks.getV2Expiry).not.toHaveBeenCalled()
  })

  it('reports no expiry for a V1 name bigname does not know', async () => {
    mocks.getName.mockResolvedValue(null)

    const result = await getExpiry('fgeorgescu.eth', 'v1')

    expect(result._unsafeUnwrap()).toEqual({
      expiry: null,
      isNonExpiring: false,
      protocol: 'v1',
    })
  })

  it('returns err when bigname fails for a V1 name', async () => {
    mocks.getName.mockRejectedValue(new Error('bigname down'))

    const result = await getExpiry('fgeorgescu.eth', 'v1')

    expect(result.isErr()).toBe(true)
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
    expect(mocks.getName).not.toHaveBeenCalled()
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
    mocks.getName.mockResolvedValue(subnameDetail('1821700419'))

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
    mocks.getName.mockResolvedValue(null)

    const result = await getExpiry('mini.shiba.eth')

    expect(result._unsafeUnwrap().expiry).toBeNull()
  })

  it('reports no expiry for a subname whose parent set none', async () => {
    mocks.getName.mockResolvedValue(subnameDetail(null))

    const result = await getExpiry('mini.shiba.eth')

    expect(result._unsafeUnwrap().expiry).toBeNull()
  })

  it('reports no expiry when bigname fails', async () => {
    mocks.getName.mockRejectedValue(new Error('bigname down'))

    const result = await getExpiry('mini.shiba.eth')

    expect(result._unsafeUnwrap().expiry).toBeNull()
  })

  it('reports no grace window after a subname expires', async () => {
    mocks.getName.mockResolvedValue(subnameDetail('1600000000'))

    const status = getProfileExpiryResultStatus(
      (await getExpiry('mini.shiba.eth'))._unsafeUnwrap(),
    )

    expect(status.isInGrace).toBe(false)
    expect(status.graceEndDate).toBeNull()
    expect(status.isPastGrace).toBe(true)
    expect(status.displayExpiryDate).toEqual(new Date(1_600_000_000 * 1000))
  })
})
